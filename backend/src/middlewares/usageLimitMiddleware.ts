// backend/src/middlewares/usageLimitMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { UsageLimitService } from "../services/UsageLimitService";

/**
 * 特定の機能の利用制限をチェックするミドルウェア
 * @param featureKey 機能を識別するキー
 * @returns ミドルウェア関数
 */
export function checkUsageLimit(featureKey: string) {
  const usageLimitService = new UsageLimitService();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      // 認証されていない場合はエラー
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "認証されていません",
        });
      }

      // 管理者の場合は制限チェックをスキップ
      if (req.user?.role === "admin") {
        return next();
      }

      // 利用可能かチェック
      const { canUse, remaining, limit } =
        await usageLimitService.canUseFeature(userId, featureKey);

      if (!canUse) {
        return res.status(403).json({
          success: false,
          message: "今日の利用制限に達しました",
          data: {
            feature_key: featureKey,
            remaining: 0,
            limit,
          },
        });
      }

      // リクエスト情報に利用状況を追加（後続処理で利用可能）
      req.usageInfo = {
        feature_key: featureKey,
        remaining,
        limit,
      };

      // 次のミドルウェアまたはコントローラーに進む
      next();
    } catch (error) {
      console.error("利用制限チェックエラー:", error);
      res.status(500).json({
        success: false,
        message: "利用制限のチェックでエラーが発生しました",
      });
    }
  };
}

/**
 * 利用ログを記録するミドルウェア
 * @param featureKey 機能を識別するキー
 * @param getRequestIdFn リクエストからリクエストIDを取得する関数
 * @param getMetadataFn リクエストからメタデータを取得する関数 (省略可)
 * @returns ミドルウェア関数
 */
export function logUsage(
  featureKey: string,
  getRequestIdFn?: (req: Request) => string | undefined,
  getMetadataFn?: (req: Request) => any
) {
  const usageLimitService = new UsageLimitService();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      // 認証されていない場合は記録せずに次へ
      if (!userId) {
        return next();
      }

      // 管理者の場合はログ記録をスキップ
      if (req.user?.role === "admin") {
        return next();
      }

      // リクエストIDとメタデータを取得
      const requestId = getRequestIdFn ? getRequestIdFn(req) : undefined;
      const metadata = getMetadataFn ? getMetadataFn(req) : undefined;

      // 応答をインターセプトして利用ログを記録
      const originalSend = res.send;
      res.send = function (body) {
        // 成功レスポンスの場合のみログを記録
        const responseBody = typeof body === "string" ? JSON.parse(body) : body;
        if (
          res.statusCode >= 200 &&
          res.statusCode < 300 &&
          responseBody.success !== false
        ) {
          // 非同期で記録して応答を遅延させない
          usageLimitService
            .logUsage(userId, featureKey, requestId, metadata)
            .catch((err) => console.error("利用ログ記録エラー:", err));
        }
        return originalSend.call(this, body);
      };

      // 次のミドルウェアまたはコントローラーに進む
      next();
    } catch (error) {
      console.error("利用ログ記録エラー:", error);
      // エラーが発生しても処理は継続
      next();
    }
  };
}

// Request型を拡張して usageInfo プロパティを追加
declare global {
  namespace Express {
    interface Request {
      usageInfo?: {
        feature_key: string;
        remaining: number;
        limit: number;
      };
    }
  }
}
