// backend/src/routes/aiChatRoutes.ts
import express from "express";
import {
  AIChatController,
  AIChatStreamController,
} from "../controllers/AIChatController";
import { authenticate } from "../middlewares/authMiddleware";
import { checkUsageLimit, logUsage } from "../middlewares/usageLimitMiddleware";

const router = express.Router();
const aiChatController = new AIChatController();
const aiChatStreamController = new AIChatStreamController();

// 認証ミドルウェアを適用
router.use(authenticate);

// 通常のAIチャットメッセージ処理エンドポイント
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

// ストリーミング対応AIチャットメッセージ処理エンドポイント
// 注: ストリーミングには専用のルートを使用し、利用制限チェックはコントローラー内で処理
router.post(
  "/message/stream",
  authenticate, // 認証のみ適用（利用制限はコントローラ内で処理）
  aiChatStreamController.chatMessageStream
);

export default router;
