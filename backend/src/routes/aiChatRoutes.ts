// backend/src/routes/aiChatRoutes.ts
import express from "express";
import { AIChatController } from "../controllers/AIChatController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const aiChatController = new AIChatController();

// 認証ミドルウェアを適用
router.use(authenticate);

// AIチャットメッセージ処理エンドポイント
router.post("/message", aiChatController.chatMessage);

export default router;
