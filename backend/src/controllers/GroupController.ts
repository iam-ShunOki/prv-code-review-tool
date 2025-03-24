// backend/src/controllers/GroupController.ts
import { Request, Response } from "express";
import { UserGroupService } from "../services/UserGroupService";
import { GroupMemberRole } from "../models/UserGroupMember";
import { z } from "zod";

export class GroupController {
  private groupService: UserGroupService;

  constructor() {
    this.groupService = new UserGroupService();
  }

  /**
   * グループの作成
   */
  createGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupSchema = z.object({
        name: z.string().min(1, "グループ名は必須です"),
        description: z.string().optional(),
      });

      const validatedData = groupSchema.parse(req.body);
      const userId = req.user?.id;

      const group = await this.groupService.createGroup({
        name: validatedData.name,
        description: validatedData.description,
        creatorId: userId,
      });

      res.status(201).json({
        success: true,
        message: "グループが作成されました",
        data: group,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "予期せぬエラーが発生しました",
        });
      }
    }
  };

  /**
   * 全グループ取得
   */
  getAllGroups = async (req: Request, res: Response): Promise<void> => {
    try {
      const groups = await this.groupService.getAllGroups();

      res.status(200).json({
        success: true,
        data: groups,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "グループ一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * グループ詳細取得
   */
  getGroupById = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);

      if (isNaN(groupId)) {
        res.status(400).json({
          success: false,
          message: "無効なグループIDです",
        });
        return;
      }

      const group = await this.groupService.getGroupById(groupId);

      if (!group) {
        res.status(404).json({
          success: false,
          message: "グループが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: group,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "グループ詳細の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * グループ更新
   */
  updateGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);

      if (isNaN(groupId)) {
        res.status(400).json({
          success: false,
          message: "無効なグループIDです",
        });
        return;
      }

      const groupSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        is_active: z.boolean().optional(),
      });

      const validatedData = groupSchema.parse(req.body);

      const updatedGroup = await this.groupService.updateGroup(
        groupId,
        validatedData
      );

      if (!updatedGroup) {
        res.status(404).json({
          success: false,
          message: "グループが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "グループが更新されました",
        data: updatedGroup,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "グループの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * グループ削除（論理削除）
   */
  deleteGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);

      if (isNaN(groupId)) {
        res.status(400).json({
          success: false,
          message: "無効なグループIDです",
        });
        return;
      }

      const deleted = await this.groupService.deleteGroup(groupId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: "グループが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "グループが削除されました",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "グループの削除中にエラーが発生しました",
      });
    }
  };

  /**
   * グループメンバー追加
   */
  addGroupMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);

      if (isNaN(groupId)) {
        res.status(400).json({
          success: false,
          message: "無効なグループIDです",
        });
        return;
      }

      const memberSchema = z.object({
        userId: z.number(),
        role: z
          .enum(["manager", "leader", "member", "reviewer", "observer"])
          .optional(),
      });

      const validatedData = memberSchema.parse(req.body);

      const role =
        (validatedData.role as GroupMemberRole) || GroupMemberRole.MEMBER;

      const membership = await this.groupService.addGroupMember(
        groupId,
        validatedData.userId,
        role
      );

      res.status(201).json({
        success: true,
        message: "メンバーがグループに追加されました",
        data: membership,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "メンバー追加中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * グループメンバー削除
   */
  removeGroupMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);

      if (isNaN(groupId) || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "無効なIDです",
        });
        return;
      }

      const removed = await this.groupService.removeGroupMember(
        groupId,
        userId
      );

      if (!removed) {
        res.status(404).json({
          success: false,
          message: "メンバーが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "メンバーがグループから削除されました",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "メンバー削除中にエラーが発生しました",
      });
    }
  };

  /**
   * グループメンバーの役割更新
   */
  updateMemberRole = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);

      if (isNaN(groupId) || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "無効なIDです",
        });
        return;
      }

      const roleSchema = z.object({
        role: z.enum(["manager", "leader", "member", "reviewer", "observer"]),
      });

      const validatedData = roleSchema.parse(req.body);

      const updated = await this.groupService.updateMemberRole(
        groupId,
        userId,
        validatedData.role as GroupMemberRole
      );

      if (!updated) {
        res.status(404).json({
          success: false,
          message: "メンバーが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "メンバーの役割が更新されました",
        data: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "役割更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * グループメンバー一覧取得
   */
  getGroupMembers = async (req: Request, res: Response): Promise<void> => {
    try {
      const groupId = parseInt(req.params.id);

      if (isNaN(groupId)) {
        res.status(400).json({
          success: false,
          message: "無効なグループIDです",
        });
        return;
      }

      const members = await this.groupService.getGroupMembers(groupId);

      res.status(200).json({
        success: true,
        data: members,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "メンバー一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 自分のグループ一覧取得
   */
  getMyGroups = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const groups = await this.groupService.getUserGroups(userId);

      res.status(200).json({
        success: true,
        data: groups,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "グループ一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 同じグループに所属するユーザー一覧取得
   */
  getGroupMates = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const users = await this.groupService.getUsersInSameGroups(userId);

      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "同僚一覧の取得中にエラーが発生しました",
      });
    }
  };
}
