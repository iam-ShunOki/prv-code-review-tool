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

// 学習チャットメッセージの送信
router.post("/message", learningChatController.sendMessage);

export default router;
