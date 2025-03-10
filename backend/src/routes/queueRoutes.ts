// backend/src/routes/queueRoutes.ts
import express from "express";
import { authenticate } from "../middlewares/authMiddleware";
import { ReviewQueueService } from "../services/ReviewQueueService";

const router = express.Router();

// キューの状態を取得
router.get("/status", authenticate, (req, res) => {
  const queueService = ReviewQueueService.getInstance();
  const status = queueService.getQueueStatus();

  res.status(200).json({
    success: true,
    data: status,
  });
});

export default router;
