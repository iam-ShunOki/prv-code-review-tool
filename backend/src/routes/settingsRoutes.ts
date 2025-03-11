// backend/src/routes/settingsRoutes.ts
import express from "express";
import { SettingsController } from "../controllers/SettingsController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const settingsController = new SettingsController();

// 認証ミドルウェアを適用
router.use(authenticate);

// プロフィール更新
router.patch("/profile", settingsController.updateProfile);

// パスワード変更
router.post("/change-password", settingsController.changePassword);

// 通知設定取得
router.get("/notifications", settingsController.getNotificationSettings);

// 通知設定更新
router.patch("/notifications", settingsController.updateNotificationSettings);

export default router;
