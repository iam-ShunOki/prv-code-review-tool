// backend/src/routes/projectRoutes.ts
import express from "express";
import { ProjectController } from "../controllers/ProjectController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const projectController = new ProjectController();

// 全てのユーザーがアクセス可能なエンドポイント
router.get("/all", authenticate, projectController.getAllProjects);
router.get("/my", authenticate, projectController.getMyProjects);
router.get("/:id", authenticate, projectController.getProjectById);
router.get("/:id/members", authenticate, projectController.getProjectMembers);

// 管理者専用エンドポイント
router.post("/", authenticate, requireAdmin, projectController.createProject);
router.patch(
  "/:id",
  authenticate,
  requireAdmin,
  projectController.updateProject
);
router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  projectController.deleteProject
);

// プロジェクトメンバー管理（管理者のみ）
router.post(
  "/:id/members",
  authenticate,
  requireAdmin,
  projectController.addProjectMember
);
router.delete(
  "/:id/members/:userId",
  authenticate,
  requireAdmin,
  projectController.removeProjectMember
);
router.patch(
  "/:id/members/:userId/role",
  authenticate,
  requireAdmin,
  projectController.updateMemberRole
);

export default router;
