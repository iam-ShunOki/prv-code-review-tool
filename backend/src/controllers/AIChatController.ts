// backend/src/controllers/AIChatController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { AIAssistantService } from "../services/AIAssistantService";
import { UsageLimitService } from "../services/UsageLimitService";
import { ChatService } from "../services/ChatService";
import { ChatSender } from "../models/ChatMessage";

export class AIChatController {
  private aiAssistantService: AIAssistantService;
  private usageLimitService: UsageLimitService;
  private chatService: ChatService;

  constructor() {
    this.aiAssistantService = new AIAssistantService();
    this.usageLimitService = new UsageLimitService();
    this.chatService = new ChatService();
  }

  /**
   * AIチャットメッセージを処理
   */
  chatMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const messageSchema = z.object({
        message: z.string().min(1, "メッセージは必須です"),
        reviewId: z.number().optional(),
        context: z
          .object({
            reviewTitle: z.string().optional(),
            codeContent: z.string().optional(),
            feedbacks: z
              .array(
                z.object({
                  problem_point: z.string(),
                  suggestion: z.string(),
                  priority: z.string(),
                })
              )
              .optional(),
          })
          .optional(),
      });

      const validatedData = messageSchema.parse(req.body);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // AIアシスタントからのレスポンスを取得
      const aiResponse = await this.aiAssistantService.getResponse(
        validatedData.message,
        validatedData.reviewId || 0,
        validatedData.context || {}
      );

      res.status(200).json({
        success: true,
        data: {
          message: aiResponse,
        },
      });
    } catch (error) {
      // エラーハンドリング
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "メッセージ処理中にエラーが発生しました",
        });
      }
    }
  };
}

export class AIChatStreamController {
  private aiAssistantService: AIAssistantService;
  private usageLimitService: UsageLimitService;
  private chatService: ChatService;

  constructor() {
    this.aiAssistantService = new AIAssistantService();
    this.usageLimitService = new UsageLimitService();
    this.chatService = new ChatService();
  }

  /**
   * AIチャットメッセージをストリーミング形式で処理
   */
  chatMessageStream = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const messageSchema = z.object({
        message: z.string().min(1, "メッセージは必須です"),
        reviewId: z.number().optional(),
        sessionId: z.string().optional(),
        context: z
          .object({
            reviewTitle: z.string().optional(),
            codeContent: z.string().optional(),
            feedbacks: z
              .array(
                z.object({
                  problem_point: z.string(),
                  suggestion: z.string(),
                  priority: z.string(),
                })
              )
              .optional(),
          })
          .optional(),
      });

      const validatedData = messageSchema.parse(req.body);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 利用制限をチェック
      const canUseChat = await this.usageLimitService.canUseFeature(
        userId,
        "ai_chat"
      );

      if (!canUseChat.canUse) {
        res.status(403).json({
          success: false,
          message: "本日の利用制限に達しました",
          data: canUseChat,
        });
        return;
      }

      // セッションID生成または取得
      const sessionId =
        validatedData.sessionId ||
        `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      // ユーザーメッセージを保存
      await this.chatService.saveMessage(
        userId,
        validatedData.message,
        ChatSender.USER,
        sessionId,
        validatedData.reviewId
      );

      // 利用をログに記録
      await this.usageLimitService.logUsage(
        userId,
        "ai_chat",
        validatedData.reviewId?.toString(),
        {
          messageLength: validatedData.message.length,
          sessionId: sessionId,
        }
      );

      // ストリーミングレスポンスのヘッダー設定
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // クライアントとの接続が切れたときの検出
      req.on("close", () => {
        console.log(
          `ストリーミング接続が終了しました (ユーザーID: ${userId}, セッションID: ${sessionId})`
        );
      });

      // AIアシスタントからストリーミングレスポンスを取得
      const streamGenerator = this.aiAssistantService.getStreamingResponse(
        validatedData.message,
        validatedData.reviewId || 0,
        validatedData.context || {}
      );

      // 完全なAI応答を保存するための変数
      let completeAiResponse = "";

      // ストリームをクライアントに送信
      for await (const chunk of streamGenerator) {
        // 応答テキストを蓄積
        completeAiResponse += chunk;

        // チャンクを送信
        res.write(chunk);
        // Express.jsのレスポンスオブジェクトにflushメソッドがない場合があるため、
        // 代替手段としてsetTimeoutを使用して非同期処理を促進
        setTimeout(() => {}, 0);
      }

      // ストリーミング終了後にAIのメッセージを保存
      await this.chatService.saveMessage(
        userId,
        completeAiResponse,
        ChatSender.AI,
        sessionId,
        validatedData.reviewId
      );

      // ストリーミング終了
      res.end();
    } catch (error) {
      console.error("AIストリーミングエラー:", error);

      // エラーハンドリング
      if (!res.headersSent) {
        // ヘッダーがまだ送信されていない場合のみJSONを返す
        if (error instanceof z.ZodError) {
          res.status(400).json({
            success: false,
            message: "バリデーションエラー",
            errors: error.errors,
          });
        } else if (error instanceof Error) {
          res.status(500).json({
            success: false,
            message: error.message,
          });
        } else {
          res.status(500).json({
            success: false,
            message: "メッセージ処理中にエラーが発生しました",
          });
        }
      } else {
        // ヘッダーが既に送信されている場合は、エラーメッセージをストリームに書き込む
        try {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "不明なエラーが発生しました";
          res.write(`エラーが発生しました: ${errorMessage}`);
          res.end();
        } catch (writeError) {
          console.error("ストリームへのエラー書き込み失敗:", writeError);
        }
      }
    }
  };
}
