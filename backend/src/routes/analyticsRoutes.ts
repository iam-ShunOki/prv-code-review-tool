// backend/src/routes/analyticsRoutes.ts
import express from "express";
import { AnalyticsController } from "../controllers/AnalyticsController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const analyticsController = new AnalyticsController();

// 全てのAPIに認証と管理者権限チェックを適用
router.use(authenticate, requireAdmin);

// ダッシュボード用のサマリー情報を取得
router.get("/dashboard-summary", analyticsController.getDashboardSummary);

// スキルレベル分布を取得
router.get("/skill-distribution", analyticsController.getSkillDistribution);

// 成長推移データを取得
router.get("/growth-trend", analyticsController.getGrowthTrend);

// 問題点タイプ別統計情報を取得
router.get("/feedback-stats", analyticsController.getFeedbackTypeStats);

// 特定社員の詳細分析情報を取得
router.get("/employee/:id", analyticsController.getEmployeeAnalytics);

// 分析レポートをエクスポート
router.get("/export", analyticsController.exportAnalyticsData);

// 新入社員ランキングを取得
router.get("/trainee-ranking", analyticsController.getTraineeRanking);

export default router;
