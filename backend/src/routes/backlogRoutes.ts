// backend/src/routes/backlogRoutes.ts

import express from "express";
import { BacklogController } from "../controllers/BacklogController";
import { BacklogWebhookController } from "../controllers/BacklogWebhookController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const backlogController = new BacklogController();
const backlogWebhookController = new BacklogWebhookController();

// Backlog接続ステータスチェック
router.get("/status", authenticate, backlogController.checkConnectionStatus);

// プロジェクト関連API
router.get("/projects", authenticate, backlogController.getProjects);
router.get(
  "/projects/:projectId/repositories",
  authenticate,
  backlogController.getRepositories
);

// リポジトリ関連API
router.post(
  "/repositories/vectorize",
  authenticate,
  backlogController.vectorizeRepository
);
router.post(
  "/repositories/search",
  authenticate,
  backlogController.searchSimilarCode
);

// プルリクエスト関連API
router.post(
  "/submit-changes",
  authenticate,
  backlogController.submitCodeChanges
);
router.post(
  "/send-feedback",
  authenticate,
  backlogController.sendFeedbackToBacklog
);

// Webhook関連
router.post("/webhook", backlogWebhookController.handleWebhook);
router.get(
  "/webhook/check",
  authenticate,
  backlogWebhookController.checkExistingPullRequests
);
router.get(
  "/webhook/info",
  authenticate,
  backlogWebhookController.getWebhookInfo
);

// 新API追加: プルリクエストのレビュー履歴を取得
router.get(
  "/pullrequest-history/:projectKey/:repoName/:pullRequestId",
  authenticate,
  backlogWebhookController.getPullRequestReviewHistory
);

// ブランチ一覧取得
router.get(
  "/projects/:projectId/repositories/:repoId/branches",
  authenticate,
  backlogController.getBranches
);

// ファイルツリー取得
router.get(
  "/projects/:projectId/repositories/:repoId/tree",
  authenticate,
  backlogController.getFileTree
);

// プルリクエストコメント一覧を取得
router.get(
  "/projects/:projectId/repositories/:repoId/pullRequests/:pullRequestId/comments",
  authenticate,
  backlogController.getPullRequestComments
);

// ファイル内容を取得
router.get(
  "/projects/:projectId/repositories/:repoId/contents",
  authenticate,
  backlogController.getFileContent
);

// リポジトリマッピング関連
router.get(
  "/repositories/mappings",
  authenticate,
  requireAdmin,
  backlogController.getRepositoryMappings
);

router.post(
  "/repositories/mappings",
  authenticate,
  requireAdmin,
  backlogController.createManualRepositoryMapping
);

router.patch(
  "/repositories/mappings/:repositoryId",
  authenticate,
  requireAdmin,
  backlogController.updateRepositoryProjectMapping
);

export default router;
