// backend/src/routes/githubRoutes.ts
import express from "express";
import { GitHubWebhookController } from "../controllers/GitHubWebhookController";
import { GitHubRepositoryController } from "../controllers/GitHubRepositoryController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const githubWebhookController = new GitHubWebhookController();
const githubRepositoryController = new GitHubRepositoryController();

// GitHub Webhook エンドポイント
router.post("/webhook", githubWebhookController.handleWebhook);

// リポジトリ管理API（認証と管理者権限が必要）
router.get(
  "/repositories",
  authenticate,
  requireAdmin,
  githubRepositoryController.getAllRepositories
);
router.post(
  "/repositories",
  authenticate,
  requireAdmin,
  githubRepositoryController.createRepository
);
router.get(
  "/repositories/:id",
  authenticate,
  requireAdmin,
  githubRepositoryController.getRepositoryById
);
router.put(
  "/repositories/:id",
  authenticate,
  requireAdmin,
  githubRepositoryController.updateRepository
);
router.delete(
  "/repositories/:id",
  authenticate,
  requireAdmin,
  githubRepositoryController.deleteRepository
);

// リポジトリ検証API
router.post(
  "/validate-repository",
  authenticate,
  requireAdmin,
  githubRepositoryController.validateRepository
);

// オーナー別リポジトリ取得API
router.get(
  "/owners/:owner/repositories",
  authenticate,
  requireAdmin,
  githubRepositoryController.getRepositoriesByOwner
);

// 健全性チェックエンドポイント
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GitHub API連携システムは正常に動作しています",
  });
});

export default router;
