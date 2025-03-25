// backend/src/controllers/LearningChatController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { ChatService } from "../services/ChatService";
import { LearningAIService } from "../services/LearningAIService";
import { ChatSender } from "../models/ChatMessage";
import { UsageLimitService } from "../services/UsageLimitService";

export class LearningChatController {
  private chatService: ChatService;
  private learningAIService: LearningAIService;
  private usageLimitService: UsageLimitService;

  constructor() {
    this.chatService = new ChatService();
    this.learningAIService = new LearningAIService();
    this.usageLimitService = new UsageLimitService();
  }

  /**
   * 学習チャットの履歴を取得
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

      // クエリパラメータからconversationIdを取得（オプション）
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      // チャット履歴を取得（プログラミング学習用チャットはreviewIdを指定しない）
      const chatHistory = await this.chatService.getChatHistory(
        userId,
        undefined, // reviewIdは未指定
        limit
      );

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
   * 学習チャットメッセージの送信
   */
  sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const messageSchema = z.object({
        message: z.string().min(1, "メッセージは必須です"),
        chatMode: z
          .enum(["general", "code-review", "debugging"])
          .default("general"),
        context: z
          .object({
            isLearningMode: z.boolean().default(true),
            preferReferences: z.boolean().default(true),
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

      // ユーザーメッセージを保存
      await this.chatService.saveMessage(
        userId,
        validatedData.message,
        ChatSender.USER
      );

      // 利用をログに記録
      await this.usageLimitService.logUsage(userId, "ai_chat", undefined, {
        messageLength: validatedData.message.length,
        chatMode: validatedData.chatMode,
      });

      // 学習AIサービスから教育的な応答を取得
      const aiResponse = await this.learningAIService.getEducationalResponse(
        validatedData.message,
        validatedData.chatMode
      );

      // AIの応答を保存
      await this.chatService.saveMessage(userId, aiResponse, ChatSender.AI);

      // レスポンスを返す
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
