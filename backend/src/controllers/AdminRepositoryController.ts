// backend/src/controllers/AdminRepositoryController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { BacklogRepositoryService } from "../services/BacklogRepositoryService";
import { BacklogService } from "../services/BacklogService";

export class AdminRepositoryController {
  private backlogRepositoryService: BacklogRepositoryService;
  private backlogService: BacklogService;

  constructor() {
    this.backlogRepositoryService = new BacklogRepositoryService();
    this.backlogService = new BacklogService();
  }

  /**
   * リポジトリ一覧を取得
   */
  getRepositories = async (req: Request, res: Response): Promise<void> => {
    try {
      const repositories =
        await this.backlogRepositoryService.getRepositories();
      res.status(200).json({
        success: true,
        data: repositories,
      });
    } catch (error) {
      console.error("リポジトリ一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "リポジトリ一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 特定のリポジトリを取得
   */
  getRepositoryById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      const repository = await this.backlogRepositoryService.getRepositoryById(
        id
      );

      if (!repository) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: repository,
      });
    } catch (error) {
      console.error("リポジトリ取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "リポジトリの取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 新規リポジトリを登録
   */
  registerRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const repositorySchema = z.object({
        project_key: z.string().min(1, "プロジェクトキーは必須です"),
        project_name: z.string().min(1, "プロジェクト名は必須です"),
        repository_name: z.string().min(1, "リポジトリ名は必須です"),
        repository_id: z.string().optional(),
        description: z.string().optional(),
        main_branch: z.string().optional(),
      });

      const validatedData = repositorySchema.parse(req.body);
      const repository = await this.backlogRepositoryService.registerRepository(
        validatedData
      );

      res.status(201).json({
        success: true,
        message: "リポジトリが登録されました",
        data: repository,
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
          message: "リポジトリの登録中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * リポジトリを更新
   */
  updateRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      const repositorySchema = z.object({
        project_name: z.string().optional(),
        repository_name: z.string().optional(),
        description: z.string().optional(),
        main_branch: z.string().optional(),
        is_active: z.boolean().optional(),
      });

      const validatedData = repositorySchema.parse(req.body);
      const repository = await this.backlogRepositoryService.updateRepository(
        id,
        validatedData
      );

      if (!repository) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "リポジトリが更新されました",
        data: repository,
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
          message: "リポジトリの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * リポジトリを削除
   */
  deleteRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      const result = await this.backlogRepositoryService.deleteRepository(id);

      if (!result) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "リポジトリが削除されました",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "リポジトリの削除中にエラーが発生しました",
      });
    }
  };

  /**
   * リポジトリをクローンしてベクトル化
   */
  syncRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);

      // 非同期で処理を開始
      res.status(202).json({
        success: true,
        message: "リポジトリの同期処理を開始しました",
      });

      // 同期処理を非同期で実行（レスポンス送信後に実行される）
      this.backlogRepositoryService
        .cloneAndVectorizeRepository(id)
        .then(() => {
          console.log(`リポジトリ同期完了 (ID: ${id})`);
        })
        .catch((error) => {
          console.error(`リポジトリ同期エラー (ID: ${id}):`, error);
        });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "リポジトリの同期処理開始中にエラーが発生しました",
      });
    }
  };

  /**
   * Backlogからプロジェクト一覧を取得（管理画面用）
   */
  getBacklogProjects = async (req: Request, res: Response): Promise<void> => {
    try {
      const projects = await this.backlogService.getProjects();
      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      console.error("Backlogプロジェクト一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "Backlogプロジェクト一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * Backlogからリポジトリ一覧を取得（管理画面用）
   */
  getBacklogRepositories = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const projectId = req.params.projectKey;
      const repositories = await this.backlogService.getRepositories(projectId);
      res.status(200).json({
        success: true,
        data: repositories,
      });
    } catch (error) {
      console.error("Backlogリポジトリ一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "Backlogリポジトリ一覧の取得中にエラーが発生しました",
      });
    }
  };
}
