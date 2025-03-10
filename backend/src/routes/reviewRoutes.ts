// backend/src/routes/reviewRoutes.ts
import express from "express";
import { ReviewController } from "../controllers/ReviewController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const reviewController = new ReviewController();

// 新規レビュー作成
router.post("/", authenticate, reviewController.createReview);

// レビュー一覧取得
router.get("/", authenticate, reviewController.getReviews);

// 特定のレビュー取得
router.get("/:id", authenticate, reviewController.getReviewById);

export default router;