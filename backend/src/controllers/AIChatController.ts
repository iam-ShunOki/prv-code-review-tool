// backend/src/controllers/AIChatController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { AIAssistantService } from "../services/AIAssistantService";
import { UsageLimitService } from "../services/UsageLimitService";

export class AIChatController {
  private aiAssistantService: AIAssistantService;
  private usageLimitService: UsageLimitService;

  constructor() {
    this.aiAssistantService = new AIAssistantService();
    this.usageLimitService = new UsageLimitService();
  }

  /**
   * AIチャットメッセージの処理
   */
  chatMessage = async (req: Request, res: Response): Promise<void> => {
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

      // 利用制限をチェック - 修正: canUseFeatureメソッドを使用
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

      // 利用をログに記録
      await this.usageLimitService.logUsage(
        userId,
        "ai_chat",
        validatedData.reviewId.toString()
      );

      // AIアシスタントからのレスポンスを取得
      const response = await this.aiAssistantService.getResponse(
        validatedData.message,
        validatedData.reviewId,
        validatedData.context || {}
      );

      // レスポンスを返す
      res.status(200).json({
        success: true,
        data: {
          message: response,
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
