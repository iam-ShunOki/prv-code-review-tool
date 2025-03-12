// backend/src/routes/backlogRoutes.ts
import express from "express";
import { BacklogController } from "../controllers/BacklogController";
import { BacklogWebhookController } from "../controllers/BacklogWebhookController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const backlogController = new BacklogController();
const backlogWebhookController = new BacklogWebhookController();

// 認証ミドルウェアを適用（Webhook以外）
router.use("/status", authenticate);
router.use("/projects", authenticate);
router.use("/submit-changes", authenticate);
router.use("/vectorize", authenticate);
router.use("/search", authenticate);
router.use("/send-feedback", authenticate);
router.use("/webhook-info", authenticate); // 追加

// Backlog接続ステータスを確認
router.get("/status", backlogController.checkConnectionStatus);

// プロジェクト一覧を取得
router.get("/projects", backlogController.getProjects);

// リポジトリ一覧を取得
router.get(
  "/projects/:projectId/repositories",
  authenticate,
  backlogController.getRepositories
);

// コード変更をプルリクエストとして提出
router.post(
  "/submit-changes",
  authenticate,
  backlogController.submitCodeChanges
);

// リポジトリをベクトル化
router.post(
  "/vectorize",
  authenticate,
  requireAdmin,
  backlogController.vectorizeRepository
);

// 類似コードを検索
router.post("/search", authenticate, backlogController.searchSimilarCode);

// レビュー結果をBacklogに手動で送信
router.post(
  "/send-feedback",
  authenticate,
  requireAdmin,
  backlogController.sendFeedbackToBacklog
);

// Webhook情報を取得
router.get(
  "/webhook-info",
  authenticate,
  requireAdmin,
  backlogWebhookController.getWebhookInfo
);

// Backlogからのwebhook受け取りエンドポイント（認証不要）
router.post("/webhook", backlogWebhookController.handleWebhook);

// 既存のプルリクエストをチェック（管理者のみ）
router.post(
  "/check-pull-requests",
  authenticate,
  requireAdmin,
  backlogWebhookController.checkExistingPullRequests
);

export default router;
