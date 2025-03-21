// backend/src/routes/groupRoutes.ts
import express from "express";
import { GroupController } from "../controllers/GroupController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const groupController = new GroupController();

// 認証済みユーザー向けエンドポイント
router.get("/", authenticate, groupController.getAllGroups);
router.get("/my", authenticate, groupController.getMyGroups);
router.get("/mates", authenticate, groupController.getGroupMates);
router.get("/:id", authenticate, groupController.getGroupById);
router.get("/:id/members", authenticate, groupController.getGroupMembers);

// 管理者向けエンドポイント
router.post("/", authenticate, requireAdmin, groupController.createGroup);
router.patch("/:id", authenticate, requireAdmin, groupController.updateGroup);
router.delete("/:id", authenticate, requireAdmin, groupController.deleteGroup);
router.post(
  "/:id/members",
  authenticate,
  requireAdmin,
  groupController.addGroupMember
);
router.delete(
  "/:id/members/:userId",
  authenticate,
  requireAdmin,
  groupController.removeGroupMember
);
router.patch(
  "/:id/members/:userId/role",
  authenticate,
  requireAdmin,
  groupController.updateMemberRole
);

export default router;
