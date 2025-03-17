// backend/src/controllers/UsageLimitController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { UsageLimitService } from "../services/UsageLimitService";

export class UsageLimitController {
  private usageLimitService: UsageLimitService;

  constructor() {
    this.usageLimitService = new UsageLimitService();
  }

  /**
   * 利用制限一覧の取得
   */
  getAllLimits = async (req: Request, res: Response): Promise<void> => {
    try {
      const limits = await this.usageLimitService.getAllLimits();
      res.status(200).json({
        success: true,
        data: limits,
      });
    } catch (error) {
      console.error("利用制限一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "利用制限一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 特定の機能の利用制限を取得
   */
  getLimitByFeature = async (req: Request, res: Response): Promise<void> => {
    try {
      const featureKey = req.params.featureKey;
      const limit = await this.usageLimitService.getLimitByFeature(featureKey);

      if (!limit) {
        res.status(404).json({
          success: false,
          message: "指定された機能の利用制限が見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: limit,
      });
    } catch (error) {
      console.error("利用制限取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "利用制限の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 利用制限を更新（管理者のみ）
   */
  updateLimit = async (req: Request, res: Response): Promise<void> => {
    try {
      // バリデーション
      const updateSchema = z.object({
        daily_limit: z.number().int().positive(),
        description: z.string().optional(),
      });

      const validatedData = updateSchema.parse(req.body);
      const featureKey = req.params.featureKey;

      // 制限を更新
      const updatedLimit = await this.usageLimitService.updateLimit(
        featureKey,
        validatedData.daily_limit,
        validatedData.description
      );

      res.status(200).json({
        success: true,
        message: "利用制限が更新されました",
        data: updatedLimit,
      });
    } catch (error) {
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
          message: "利用制限の更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 現在のユーザーの利用状況を取得
   */
  getUserUsage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      // ユーザーIDがない場合
      if (!userId) {
        console.warn("利用状況取得: ユーザーIDが見つかりません");
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // デバッグログ
      console.log(`利用状況取得: ユーザーID=${userId} の利用状況を取得します`);

      try {
        // 利用状況を取得
        const usageSummary = await this.usageLimitService.getUserUsageSummary(
          userId
        );

        // デバッグログ
        console.log(`利用状況取得: 成功`, usageSummary);

        res.status(200).json({
          success: true,
          data: usageSummary,
        });
      } catch (error) {
        console.error(`利用状況取得: サービスエラー:`, error);

        // エラーでもフロントエンドが動作するようにデフォルト値を返す
        const defaultSummary = {
          code_review: {
            used: 0,
            limit: 20,
            remaining: 20,
            canUse: true,
          },
          ai_chat: {
            used: 0,
            limit: 30,
            remaining: 30,
            canUse: true,
          },
        };

        res.status(200).json({
          success: true,
          data: defaultSummary,
          message: "デフォルト値を返しています",
        });
      }
    } catch (error) {
      console.error("利用状況取得: 致命的なエラー:", error);

      // エラーでもフロントエンドが動作するようにデフォルト値を返す
      const defaultSummary = {
        code_review: {
          used: 0,
          limit: 20,
          remaining: 20,
          canUse: true,
        },
        ai_chat: {
          used: 0,
          limit: 30,
          remaining: 30,
          canUse: true,
        },
      };

      res.status(200).json({
        success: true,
        data: defaultSummary,
        message: "エラーが発生しましたが、デフォルト値を返しています",
      });
    }
  };

  /**
   * 特定の機能の利用可否をチェック
   */
  checkFeatureUsage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const featureKey = req.params.featureKey;
      const result = await this.usageLimitService.canUseFeature(
        userId,
        featureKey
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("利用可否チェックエラー:", error);
      res.status(500).json({
        success: false,
        message: "利用可否のチェック中にエラーが発生しました",
      });
    }
  };

  /**
   * 利用ログを記録（ミドルウェアやサービスからの内部使用を想定）
   */
  logUsage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // バリデーション
      const logSchema = z.object({
        feature_key: z.string(),
        request_id: z.string().optional(),
        metadata: z.any().optional(),
      });

      const validatedData = logSchema.parse(req.body);

      // まず利用可能かチェック
      const { canUse, remaining } = await this.usageLimitService.canUseFeature(
        userId,
        validatedData.feature_key
      );

      if (!canUse) {
        res.status(403).json({
          success: false,
          message: "今日の利用制限に達しました",
          data: { remaining: 0 },
        });
        return;
      }

      // 利用ログを記録
      await this.usageLimitService.logUsage(
        userId,
        validatedData.feature_key,
        validatedData.request_id,
        validatedData.metadata
      );

      res.status(200).json({
        success: true,
        message: "利用が記録されました",
        data: { remaining: remaining - 1 },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("利用ログ記録エラー:", error);
        res.status(500).json({
          success: false,
          message: "利用ログの記録中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * すべてのユーザーの今日の利用状況を取得（管理者用）
   */
  getAllUsersUsageToday = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const usageData = await this.usageLimitService.getAllUsersUsageToday();

      res.status(200).json({
        success: true,
        data: usageData,
      });
    } catch (error) {
      console.error("すべてのユーザーの利用状況取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "利用状況の取得中にエラーが発生しました",
      });
    }
  };
}
