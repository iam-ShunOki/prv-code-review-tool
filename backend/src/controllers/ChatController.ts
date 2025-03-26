// backend/src/controllers/ChatController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { ChatService } from "../services/ChatService";
import { ChatSender } from "../models/ChatMessage";
import { AIAssistantService } from "../services/AIAssistantService";
import { UsageLimitService } from "../services/UsageLimitService";

export class ChatController {
  private chatService: ChatService;
  private aiAssistantService: AIAssistantService;
  private usageLimitService: UsageLimitService;

  constructor() {
    this.chatService = new ChatService();
    this.aiAssistantService = new AIAssistantService();
    this.usageLimitService = new UsageLimitService();
  }

  /**
   * チャット履歴の取得
   */
  getChatHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // クエリパラメータから取得
      const reviewId = req.query.reviewId
        ? parseInt(req.query.reviewId as string)
        : undefined;
      const sessionId = req.query.sessionId
        ? (req.query.sessionId as string)
        : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      // チャット履歴を取得
      const chatHistory = await this.chatService.getChatHistory(userId, {
        reviewId,
        sessionId,
        limit,
      });

      res.status(200).json({
        success: true,
        data: chatHistory,
      });
    } catch (error) {
      console.error("チャット履歴取得エラー:", error);

      res.status(500).json({
        success: false,
        message: "チャット履歴の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * チャットセッション一覧の取得
   */
  getChatSessions = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // ユーザーのチャットセッション一覧を取得
      const sessions = await this.chatService.getUserChatSessions(userId);

      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      console.error("チャットセッション取得エラー:", error);

      res.status(500).json({
        success: false,
        message: "チャットセッション一覧の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * チャットメッセージの送信（AI応答を含む）
   */
  sendMessage = async (req: Request, res: Response): Promise<void> => {
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

      // AIアシスタントからのレスポンスを取得
      const aiResponse = await this.aiAssistantService.getResponse(
        validatedData.message,
        validatedData.reviewId || 0,
        validatedData.context || {}
      );

      // AIの応答を保存
      await this.chatService.saveMessage(
        userId,
        aiResponse,
        ChatSender.AI,
        sessionId,
        validatedData.reviewId
      );

      // レスポンスを返す
      res.status(200).json({
        success: true,
        data: {
          message: aiResponse,
          sessionId: sessionId,
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
