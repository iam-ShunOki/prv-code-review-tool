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

export default router;
