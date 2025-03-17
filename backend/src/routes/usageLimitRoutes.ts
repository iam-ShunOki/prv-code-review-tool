// backend/src/routes/usageLimitRoutes.ts
import express from "express";
import { UsageLimitController } from "../controllers/UsageLimitController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const usageLimitController = new UsageLimitController();

// 認証が必要なルート
router.use(authenticate);

// ユーザー自身の利用状況を取得
router.get("/my-usage", usageLimitController.getUserUsage);

// 特定機能の利用可否をチェック
router.get("/check/:featureKey", usageLimitController.checkFeatureUsage);

// 利用ログを記録
router.post("/log", usageLimitController.logUsage);

// 以下は管理者権限が必要
router.use(requireAdmin);

// 全ての制限を取得
router.get("/", usageLimitController.getAllLimits);

// 特定の機能の制限を取得
router.get("/:featureKey", usageLimitController.getLimitByFeature);

// 制限を更新
router.patch("/:featureKey", usageLimitController.updateLimit);

// すべてのユーザーの今日の利用状況を取得
router.get("/stats/today", usageLimitController.getAllUsersUsageToday);

export default router;
