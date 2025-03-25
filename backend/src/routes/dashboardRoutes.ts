// backend/src/routes/dashboardRoutes.ts
import express from "express";
import { DashboardController } from "../controllers/DashboardController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const dashboardController = new DashboardController();

// ダッシュボード統計情報取得 (認証必須)
router.get("/stats", authenticate, dashboardController.getDashboardStats);

export default router;
