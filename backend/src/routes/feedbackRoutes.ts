// backend/src/routes/feedbackRoutes.ts
import express from "express";
import { FeedbackController } from "../controllers/FeedbackController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const feedbackController = new FeedbackController();

// 認証ミドルウェアを適用
router.use(authenticate);

// 特定の提出のフィードバック一覧を取得
router.get(
  "/submission/:submissionId",
  feedbackController.getFeedbacksBySubmissionId
);

// フィードバックの対応状態を更新
router.patch("/:id/status", feedbackController.updateFeedbackStatus);

// 【新規追加】フィードバックのチェック状態を更新
router.patch("/:id/check", feedbackController.updateFeedbackCheckStatus);

// 【新規追加】複数フィードバックのチェック状態を一括更新
router.post("/bulk-check", feedbackController.bulkUpdateCheckStatus);

// 【新規追加】フィードバックのカテゴリを更新
router.patch("/:id/category", feedbackController.updateFeedbackCategory);

export default router;
