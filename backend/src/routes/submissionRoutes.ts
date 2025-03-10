// backend/src/routes/submissionRoutes.ts
import express from "express";
import { SubmissionController } from "../controllers/SubmissionController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const submissionController = new SubmissionController();

// 新規コード提出
router.post("/", authenticate, submissionController.createSubmission);

// 特定のレビューのコード提出一覧を取得
router.get("/review/:reviewId", authenticate, submissionController.getSubmissionsByReviewId);

export default router;