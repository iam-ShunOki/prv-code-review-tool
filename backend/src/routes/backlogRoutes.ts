// backend/src/routes/backlogRoutes.ts
import express from "express";
import { BacklogController } from "../controllers/BacklogController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const backlogController = new BacklogController();

// 認証ミドルウェアを適用
router.use(authenticate);

// Backlog接続ステータスを確認
router.get("/status", backlogController.checkConnectionStatus);

// プロジェクト一覧を取得
router.get("/projects", backlogController.getProjects);

// リポジトリ一覧を取得
router.get(
  "/projects/:projectId/repositories",
  backlogController.getRepositories
);

// コード変更をプルリクエストとして提出
router.post("/submit-changes", backlogController.submitCodeChanges);

export default router;
