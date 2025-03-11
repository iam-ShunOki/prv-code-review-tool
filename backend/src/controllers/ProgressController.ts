// backend/src/controllers/ProgressController.ts
import { Request, Response } from "express";
import { ProgressService } from "../services/ProgressService";

export class ProgressController {
  private progressService: ProgressService;

  constructor() {
    this.progressService = new ProgressService();
  }

  /**
   * 進捗状況の概要を取得
   */
  getProgressSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const summary = await this.progressService.getUserProgressSummary(userId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("進捗概要取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "進捗情報の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * レビュー履歴を取得
   */
  getReviewHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const history = await this.progressService.getUserReviewHistory(userId);

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error("レビュー履歴取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "レビュー履歴の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 成長推移データを取得
   */
  getGrowthTrend = async (req: Request, res: Response): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // クエリパラメータから期間を取得
      const period = req.query.period as string | undefined;

      const trendData = await this.progressService.getUserGrowthData(
        userId,
        period
      );

      res.status(200).json({
        success: true,
        data: trendData,
      });
    } catch (error) {
      console.error("成長推移データ取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "成長推移データの取得中にエラーが発生しました",
      });
    }
  };

  /**
   * フィードバック統計を取得
   */
  getFeedbackStats = async (req: Request, res: Response): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const stats = await this.progressService.getUserFeedbackStats(userId);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("フィードバック統計取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "フィードバック統計の取得中にエラーが発生しました",
      });
    }
  };
}
