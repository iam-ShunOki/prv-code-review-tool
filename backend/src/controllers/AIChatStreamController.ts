// backend/src/controllers/AIChatStreamController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { AIAssistantService } from "../services/AIAssistantService";
import { UsageLimitService } from "../services/UsageLimitService";

export class AIChatStreamController {
  private aiAssistantService: AIAssistantService;
  private usageLimitService: UsageLimitService;

  constructor() {
    this.aiAssistantService = new AIAssistantService();
    this.usageLimitService = new UsageLimitService();
  }

  /**
   * AIチャットメッセージをストリーミング形式で処理
   */
  chatMessageStream = async (req: Request, res: Response): Promise<void> => {
    let hasStartedWriting = false;

    try {
      // 入力バリデーション
      const chatSchema = z.object({
        reviewId: z.number(),
        message: z.string().min(1, "メッセージは必須です"),
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

      const validatedData = chatSchema.parse(req.body);
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

      // ストリーミングレスポンスのヘッダーを設定
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // クライアント切断を検出
      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
        console.log("Client disconnected");
      });

      // 利用をログに記録
      await this.usageLimitService.logUsage(
        userId,
        "ai_chat",
        validatedData.reviewId.toString(),
        { messageLength: validatedData.message.length }
      );

      // ストリーミング処理を開始
      console.log("Starting streaming generation process");

      try {
        // AIアシスタントからのレスポンスをストリーミング
        const completion = await this.aiAssistantService.getStreamingResponse(
          validatedData.message,
          validatedData.reviewId,
          validatedData.context || {}
        );

        // 生成されたテキストをチャンクで送信
        for await (const chunk of completion) {
          // クライアントが切断されていたら処理を中止
          if (!isClientConnected) {
            console.log(
              "Client disconnected during processing, stopping generation"
            );
            break;
          }

          // チャンクがあれば送信
          if (chunk && !res.writableEnded) {
            res.write(chunk);
            hasStartedWriting = true;
          }
        }

        // 処理完了
        if (!res.writableEnded) {
          if (!hasStartedWriting) {
            // 何も書き込まれていない場合はエラーメッセージを送信
            res.write("回答の生成に失敗しました。もう一度お試しください。");
          }
          res.end();
        }

        console.log("Streaming response completed successfully");
      } catch (streamError) {
        console.error("ストリーミング処理エラー:", streamError);

        // エラーが発生した場合でも、まだレスポンスが終了していなければエラーメッセージを送信
        if (!res.writableEnded) {
          const errorMessage =
            streamError instanceof Error
              ? `エラーが発生しました: ${streamError.message}`
              : "ストリーミング処理中にエラーが発生しました。";

          res.write(errorMessage);
          res.end();
        }
      }
    } catch (error) {
      // バリデーションエラーなどの一般的なエラーハンドリング
      console.error("AIチャット初期化エラー:", error);

      if (res.headersSent && !res.writableEnded) {
        // ヘッダーが既に送信されている場合はテキストでエラーを送信
        const errorMessage =
          error instanceof Error
            ? `エラーが発生しました: ${error.message}`
            : "予期せぬエラーが発生しました。もう一度お試しください。";
        res.write(errorMessage);
        res.end();
        return;
      }

      // ヘッダーがまだ送信されていない場合はJSONでエラーを送信
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "AIチャット処理中にエラーが発生しました",
        });
      }
    }
  };
}
