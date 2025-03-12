// backend/src/routes/adminRepositoryRoutes.ts
import express from "express";
import { AdminRepositoryController } from "../controllers/AdminRepositoryController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const adminRepositoryController = new AdminRepositoryController();

// 認証と管理者権限を確認するミドルウェアを適用
router.use(authenticate, requireAdmin);

// リポジトリ一覧を取得
router.get("/", adminRepositoryController.getRepositories);

// 新規リポジトリを登録
router.post("/", adminRepositoryController.registerRepository);

// 特定のリポジトリを取得
router.get("/:id", adminRepositoryController.getRepositoryById);

// リポジトリ情報を更新
router.patch("/:id", adminRepositoryController.updateRepository);

// リポジトリを削除
router.delete("/:id", adminRepositoryController.deleteRepository);

// リポジトリをクローンしてベクトル化
router.post("/:id/sync", adminRepositoryController.syncRepository);

// Backlogからプロジェクト一覧を取得（管理画面用）
router.get("/backlog/projects", adminRepositoryController.getBacklogProjects);

// Backlogからリポジトリ一覧を取得（管理画面用）
router.get(
  "/backlog/projects/:projectKey/repositories",
  adminRepositoryController.getBacklogRepositories
);

export default router;
