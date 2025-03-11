// backend/src/controllers/AnalyticsController.ts
import { Request, Response } from "express";
import { AnalyticsService } from "../services/AnalyticsService";

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  /**
   * ダッシュボード用のサマリー情報を取得
   */
  getDashboardSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = await this.analyticsService.getDashboardSummary();
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("ダッシュボード情報取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "ダッシュボード情報の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * スキルレベル分布を取得
   */
  getSkillDistribution = async (req: Request, res: Response): Promise<void> => {
    try {
      // クエリパラメータからフィルタリング条件を取得
      const joinYear = req.query.joinYear
        ? parseInt(req.query.joinYear as string)
        : undefined;

      const distribution = await this.analyticsService.getSkillDistribution(
        joinYear
      );
      res.status(200).json({
        success: true,
        data: distribution,
      });
    } catch (error) {
      console.error("スキル分布取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "スキル分布の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 成長推移データを取得
   */
  getGrowthTrend = async (req: Request, res: Response): Promise<void> => {
    try {
      // クエリパラメータからフィルタリング条件を取得
      const userId = req.query.userId
        ? parseInt(req.query.userId as string)
        : undefined;
      const period = req.query.period as string | undefined;

      const trendData = await this.analyticsService.getGrowthTrend(
        userId,
        period
      );
      res.status(200).json({
        success: true,
        data: trendData,
      });
    } catch (error) {
      console.error("成長推移取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "成長推移の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 問題点タイプ別統計情報を取得
   */
  getFeedbackTypeStats = async (req: Request, res: Response): Promise<void> => {
    try {
      // クエリパラメータから期間を取得
      const period = req.query.period as string | undefined;

      const stats = await this.analyticsService.getFeedbackTypeStats(period);
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

  /**
   * 特定社員の詳細分析情報を取得
   */
  getEmployeeAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const employeeId = parseInt(req.params.id);
      const analytics = await this.analyticsService.getEmployeeAnalytics(
        employeeId
      );

      if (!analytics) {
        res.status(404).json({
          success: false,
          message: "社員が見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("社員分析情報取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "社員分析情報の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 分析レポートをエクスポート（JSON形式）
   */
  exportAnalyticsData = async (req: Request, res: Response): Promise<void> => {
    try {
      // クエリパラメータからフィルタリング条件を取得
      const joinYear = req.query.joinYear
        ? parseInt(req.query.joinYear as string)
        : undefined;
      const userId = req.query.userId
        ? parseInt(req.query.userId as string)
        : undefined;

      const exportData = await this.analyticsService.getExportData(
        joinYear,
        userId
      );

      // Content-Disposition ヘッダーを設定してダウンロードさせる
      const fileName = userId
        ? `employee_${userId}_analytics.json`
        : joinYear
        ? `cohort_${joinYear}_analytics.json`
        : "analytics_export.json";

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      res.status(200).json(exportData);
    } catch (error) {
      console.error("分析データエクスポートエラー:", error);
      res.status(500).json({
        success: false,
        message: "分析データのエクスポート中にエラーが発生しました",
      });
    }
  };
}
