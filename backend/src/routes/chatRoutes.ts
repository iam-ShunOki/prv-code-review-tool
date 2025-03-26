// backend/src/routes/chatRoutes.ts
import express from "express";
import { ChatController } from "../controllers/ChatController";
import { authenticate } from "../middlewares/authMiddleware";
import { checkUsageLimit, logUsage } from "../middlewares/usageLimitMiddleware";

const router = express.Router();
const chatController = new ChatController();

// 認証ミドルウェアを適用
router.use(authenticate);

// チャット履歴の取得 (レビューID/セッションIDでフィルタリング可能)
router.get("/history", chatController.getChatHistory);

// チャットセッション一覧の取得
router.get("/sessions", chatController.getChatSessions);

// メッセージの送信 (利用制限はコントローラ内部で処理)
router.post("/message", chatController.sendMessage);

export default router;
