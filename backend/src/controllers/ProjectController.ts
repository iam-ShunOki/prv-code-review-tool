// backend/src/controllers/ProjectController.ts
import { Request, Response } from "express";
import { ProjectService } from "../services/ProjectService";
import { UserProjectRole } from "../models/UserProject";
import { ProjectStatus } from "../models/Project";
import { z } from "zod";

export class ProjectController {
  private projectService: ProjectService;

  constructor() {
    this.projectService = new ProjectService();
  }

  /**
   * プロジェクト作成
   */
  createProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectSchema = z.object({
        name: z.string().min(1, "プロジェクト名は必須です"),
        code: z.string().min(1, "プロジェクトコードは必須です"),
        description: z.string().optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        backlog_project_key: z.string().optional(),
        backlog_repository_names: z.string().optional(),
      });

      const validatedData = projectSchema.parse(req.body);
      const project = await this.projectService.createProject(validatedData);

      res.status(201).json({
        success: true,
        message: "プロジェクトが作成されました",
        data: project,
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
   * 全プロジェクト取得
   */
  getAllProjects = async (req: Request, res: Response): Promise<void> => {
    try {
      // クエリパラメータからステータスを取得（オプション）
      const status = req.query.status as ProjectStatus | undefined;

      let projects;
      if (status && Object.values(ProjectStatus).includes(status)) {
        projects = await this.projectService.getProjectsByStatus(status);
      } else {
        projects = await this.projectService.getAllProjects();
      }

      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "プロジェクト一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 自分が参加しているプロジェクト取得
   */
  getMyProjects = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const projects = await this.projectService.getUserProjects(userId);

      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "プロジェクト一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 特定のプロジェクトを取得
   */
  getProjectById = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await this.projectService.getProjectById(projectId);

      if (!project) {
        res.status(404).json({
          success: false,
          message: "プロジェクトが見つかりません",
        });
        return;
      }

      // レビューに関連するユーザー情報があるか確認し、なければ適切に対応
      if (project.reviews) {
        project.reviews = project.reviews.map((review) => {
          // userがnullの場合に最小限のダミーデータを提供
          if (!review.user) {
            review.user = {
              id: 0,
              name: "不明なユーザー",
            } as any;
          }
          return review;
        });
      }

      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (error) {
      console.error("プロジェクト取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "プロジェクトの取得中にエラーが発生しました",
      });
    }
  };

  /**
   * プロジェクト更新
   */
  updateProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        res.status(400).json({
          success: false,
          message: "無効なプロジェクトIDです",
        });
        return;
      }

      const projectSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        start_date: z.date().optional(),
        end_date: z.date().optional(),
        backlog_project_key: z.string().optional(),
        backlog_repository_names: z.string().optional(),
      });

      const validatedData = projectSchema.parse(req.body);

      // 日付の処理を分離して、明示的にDateオブジェクトに変換
      const projectUpdate: Partial<{
        name: string;
        description: string;
        status: ProjectStatus;
        start_date: Date | undefined;
        end_date: Date | undefined;
        backlog_project_key: string;
        backlog_repository_names: string;
      }> = {
        ...validatedData,
      };

      // 日付を変換
      if (validatedData.start_date) {
        validatedData.start_date = new Date(validatedData.start_date) as any;
      }

      if (validatedData.end_date) {
        validatedData.end_date = new Date(validatedData.end_date) as any;
      }

      const updatedProject = await this.projectService.updateProject(
        projectId,
        projectUpdate
      );

      if (!updatedProject) {
        res.status(404).json({
          success: false,
          message: "プロジェクトが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "プロジェクトが更新されました",
        data: updatedProject,
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
          message: "プロジェクトの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * プロジェクト削除
   */
  deleteProject = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        res.status(400).json({
          success: false,
          message: "無効なプロジェクトIDです",
        });
        return;
      }

      const deleted = await this.projectService.deleteProject(projectId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: "プロジェクトが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "プロジェクトが削除されました",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "プロジェクトの削除中にエラーが発生しました",
      });
    }
  };

  /**
   * プロジェクトメンバー追加
   */
  addProjectMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        res.status(400).json({
          success: false,
          message: "無効なプロジェクトIDです",
        });
        return;
      }

      const memberSchema = z.object({
        userId: z.number(),
        role: z.enum(["leader", "member", "reviewer", "observer"]).optional(),
      });

      const validatedData = memberSchema.parse(req.body);

      const role =
        (validatedData.role as UserProjectRole) || UserProjectRole.MEMBER;

      const userProject = await this.projectService.addProjectMember(
        projectId,
        validatedData.userId,
        role
      );

      res.status(201).json({
        success: true,
        message: "メンバーがプロジェクトに追加されました",
        data: userProject,
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
   * プロジェクトメンバー削除
   */
  removeProjectMember = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);

      if (isNaN(projectId) || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "無効なIDです",
        });
        return;
      }

      const removed = await this.projectService.removeProjectMember(
        projectId,
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
        message: "メンバーがプロジェクトから削除されました",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "メンバー削除中にエラーが発生しました",
      });
    }
  };

  /**
   * プロジェクトメンバーの役割更新
   */
  updateMemberRole = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);

      if (isNaN(projectId) || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: "無効なIDです",
        });
        return;
      }

      const roleSchema = z.object({
        role: z.enum(["leader", "member", "reviewer", "observer"]),
      });

      const validatedData = roleSchema.parse(req.body);

      const updated = await this.projectService.updateMemberRole(
        projectId,
        userId,
        validatedData.role as UserProjectRole
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
   * プロジェクトメンバー一覧取得
   */
  getProjectMembers = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        res.status(400).json({
          success: false,
          message: "無効なプロジェクトIDです",
        });
        return;
      }

      const members = await this.projectService.getProjectMembers(projectId);

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
}
