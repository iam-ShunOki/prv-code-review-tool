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

      // レビュー情報と必要なコンテキストを取得
      // 実際の実装では、ここでレビュー情報やコード提出情報を取得する処理を追加

      // ストリーミングレスポンスのヘッダーを設定
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // SSE (Server-Sent Events) ヘッダーを設定する場合
      // res.setHeader("Content-Type", "text/event-stream");
      // res.setHeader("Cache-Control", "no-cache");
      // res.setHeader("Connection", "keep-alive");

      // 利用をログに記録
      await this.usageLimitService.logUsage(
        userId,
        "ai_chat",
        validatedData.reviewId.toString()
      );

      // ストリーミング処理を開始
      const streamResponse = async () => {
        try {
          // AIアシスタントからのレスポンスをストリーミング
          const completion = await this.aiAssistantService.getStreamingResponse(
            validatedData.message,
            validatedData.reviewId,
            validatedData.context || {}
          );

          // 文字が生成されるたびに送信
          for await (const chunk of completion) {
            // チャンクがあれば送信
            if (chunk && !res.writableEnded) {
              res.write(chunk);
            }
          }

          // 処理完了
          if (!res.writableEnded) {
            res.end();
          }
        } catch (streamError) {
          console.error("ストリーミング処理エラー:", streamError);

          // エラーが発生した場合でも、まだレスポンスが終了していなければエラーメッセージを送信
          if (!res.writableEnded) {
            res.write("ストリーミング処理中にエラーが発生しました。");
            res.end();
          }
        }
      };

      // ストリーミング処理を実行
      streamResponse().catch((error) => {
        console.error("ストリーミング処理の実行に失敗:", error);
      });
    } catch (error) {
      // バリデーションエラーなどの一般的なエラーハンドリング
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
