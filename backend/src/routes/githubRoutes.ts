// backend/src/routes/githubRoutes.ts
import express from "express";
import { GitHubWebhookController } from "../controllers/GitHubWebhookController";

const router = express.Router();
const githubWebhookController = new GitHubWebhookController();

// GitHub Webhook エンドポイント
router.post("/webhook", githubWebhookController.handleWebhook);

// 健全性チェックエンドポイント
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GitHub API連携システムは正常に動作しています",
  });
});

export default router;
