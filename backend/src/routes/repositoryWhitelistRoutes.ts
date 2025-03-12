// backend/src/routes/repositoryWhitelistRoutes.ts
import express from "express";
import { RepositoryWhitelistController } from "../controllers/RepositoryWhitelistController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const repositoryWhitelistController = new RepositoryWhitelistController();

// すべてのルートに認証と管理者権限を要求
router.use(authenticate, requireAdmin);

// ホワイトリスト一覧取得
router.get("/", repositoryWhitelistController.getWhitelist);

// リポジトリをホワイトリストに追加
router.post("/", repositoryWhitelistController.addToWhitelist);

// 自動返信設定を更新
router.patch(
  "/auto-reply",
  repositoryWhitelistController.updateAutoReplySettings
);

// リポジトリをホワイトリストから削除
router.delete(
  "/:projectKey/:repositoryName",
  repositoryWhitelistController.removeFromWhitelist
);

// リポジトリのホワイトリスト状態を確認
router.get(
  "/:projectKey/:repositoryName",
  repositoryWhitelistController.checkRepository
);

export default router;
