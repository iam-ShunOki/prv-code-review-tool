// backend/src/routes/progressRoutes.ts
import express from "express";
import { ProgressController } from "../controllers/ProgressController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const progressController = new ProgressController();

// 認証ミドルウェアを適用
router.use(authenticate);

// 進捗状況の概要を取得
router.get("/summary", progressController.getProgressSummary);

// レビュー履歴を取得
router.get("/review-history", progressController.getReviewHistory);

// 成長推移データを取得
router.get("/growth-trend", progressController.getGrowthTrend);

// フィードバック統計を取得
router.get("/feedback-stats", progressController.getFeedbackStats);

export default router;
