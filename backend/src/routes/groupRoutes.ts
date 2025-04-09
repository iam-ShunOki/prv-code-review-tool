// backend/src/routes/githubRoutes.ts
import express from "express";
import { GitHubWebhookController } from "../controllers/GitHubWebhookController";
import { GitHubRepositoryController } from "../controllers/GitHubRepositoryController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const githubWebhookController = new GitHubWebhookController();
const githubRepositoryController = new GitHubRepositoryController();

// Webhookエンドポイント (認証なし)
router.post("/webhook", githubWebhookController.handleWebhook);

// GitHub情報取得
router.get("/info", authenticate, githubWebhookController.getGitHubInfo);

// PR関連エンドポイント
router.post(
  "/check-prs",
  authenticate,
  requireAdmin,
  githubWebhookController.checkExistingPRs
);

// リポジトリテスト
router.get(
  "/test-repository/:id",
  authenticate,
  requireAdmin,
  githubWebhookController.testRepository
);

// リポジトリ関連API (認証あり)
router.get(
  "/repositories",
  authenticate,
  githubRepositoryController.getAllRepositories
);

router.get(
  "/repositories/:id",
  authenticate,
  githubRepositoryController.getRepositoryById
);

router.post(
  "/repositories",
  authenticate,
  requireAdmin,
  githubRepositoryController.createRepository
);

router.put(
  "/repositories/:id",
  authenticate,
  requireAdmin,
  githubRepositoryController.updateRepository
);

router.patch(
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

// リポジトリ検証
router.post(
  "/validate-repository",
  authenticate,
  requireAdmin,
  githubRepositoryController.validateRepository
);

// オーナー別リポジトリ取得
router.get(
  "/owners/:owner/repositories",
  authenticate,
  githubRepositoryController.getRepositoriesByOwner
);

export default router;
