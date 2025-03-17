// backend/src/routes/aiChatRoutes.ts (更新版)
import express from "express";
import { AIChatController } from "../controllers/AIChatController";
import { authenticate } from "../middlewares/authMiddleware";
import { checkUsageLimit, logUsage } from "../middlewares/usageLimitMiddleware";

const router = express.Router();
const aiChatController = new AIChatController();

// 認証ミドルウェアを適用
router.use(authenticate);

// AIチャットメッセージ処理エンドポイント (利用制限チェックと記録を追加)
router.post(
  "/message",
  checkUsageLimit("ai_chat"), // 利用制限をチェック
  logUsage(
    "ai_chat",
    (req) => req.body.reviewId?.toString(),
    (req) => ({
      reviewId: req.body.reviewId,
      messageLength: req.body.message?.length || 0,
    })
  ),
  aiChatController.chatMessage
);

export default router;
