// backend/src/routes/learningChatRoutes.ts
import express from "express";
import { LearningChatController } from "../controllers/LearningChatController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const learningChatController = new LearningChatController();

// すべてのルートに認証ミドルウェアを適用
router.use(authenticate);

// 学習チャット履歴の取得
router.get("/history", learningChatController.getChatHistory);

// 学習チャットセッション一覧の取得
router.get("/sessions", learningChatController.getChatSessions);

// 特定セッションのメッセージを取得（sessionIdパラメータ必須）
router.get("/messages", learningChatController.getSessionMessages);

// 学習チャットメッセージの送信
router.post("/message", learningChatController.sendMessage);

export default router;
