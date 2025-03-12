// backend/src/routes/webhookRoutes.ts
import express from "express";
import { WebhookController } from "../controllers/WebhookController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const webhookController = new WebhookController();

// 全てのAPIに認証と管理者権限チェックを適用
router.use(authenticate, requireAdmin);

// Webhook URL管理エンドポイント
router.get("/url", webhookController.getWebhookUrl);
router.post("/url", webhookController.updateWebhookUrl);
router.post("/detect-ngrok", webhookController.detectNgrokUrl);
router.post("/test", webhookController.testWebhook);

export default router;
