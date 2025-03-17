// backend/src/routes/reviewRoutes.ts (更新版)
import express from "express";
import { ReviewController } from "../controllers/ReviewController";
import { authenticate } from "../middlewares/authMiddleware";
import { checkUsageLimit, logUsage } from "../middlewares/usageLimitMiddleware";

const router = express.Router();
const reviewController = new ReviewController();

// 新規レビュー作成 (利用制限チェックと記録を追加)
router.post(
  "/",
  authenticate,
  checkUsageLimit("code_review"), // 利用制限をチェック
  logUsage("code_review", (req) => req.body.title), // 利用ログを記録
  reviewController.createReview
);

// レビュー一覧取得
router.get("/", authenticate, reviewController.getReviews);

// 特定のレビュー取得
router.get("/:id", authenticate, reviewController.getReviewById);

export default router;
