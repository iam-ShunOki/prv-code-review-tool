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

      // クエリパラメータからsessionIdを取得（オプション）
      const sessionId = req.query.sessionId
        ? (req.query.sessionId as string)
        : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      // チャット履歴を取得
      const chatHistory = await this.chatService.getChatHistory(userId, {
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
   * 特定セッションのメッセージを取得
   */
  getSessionMessages = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // セッションIDの取得（必須）
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: "セッションIDは必須です",
        });
        return;
      }

      // セッションのメッセージを取得
      const messages = await this.chatService.getChatHistory(userId, {
        sessionId,
      });

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error("セッションメッセージ取得エラー:", error);

      res.status(500).json({
        success: false,
        message: "セッションメッセージの取得中にエラーが発生しました",
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
        sessionId: z.string().optional(),
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

      // セッションID生成または取得
      const sessionId =
        validatedData.sessionId ||
        `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      // ユーザーメッセージを保存
      await this.chatService.saveMessage(
        userId,
        validatedData.message,
        ChatSender.USER,
        sessionId
      );

      // 利用をログに記録
      await this.usageLimitService.logUsage(userId, "ai_chat", undefined, {
        messageLength: validatedData.message.length,
        chatMode: validatedData.chatMode,
        sessionId: sessionId,
      });

      // 学習AIサービスから教育的な応答を取得
      const aiResponse = await this.learningAIService.getEducationalResponse(
        validatedData.message,
        validatedData.chatMode
      );

      // AIの応答を保存
      await this.chatService.saveMessage(
        userId,
        aiResponse,
        ChatSender.AI,
        sessionId
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
