// backend/src/controllers/GitHubRepositoryController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { GitHubRepositoryService } from "../services/GitHubRepositoryService";
import { GitHubService } from "../services/GitHubService";

export class GitHubRepositoryController {
  private githubRepositoryService: GitHubRepositoryService;
  private githubService: GitHubService;

  constructor() {
    this.githubRepositoryService = new GitHubRepositoryService();
    this.githubService = new GitHubService();
  }

  /**
   * すべてのGitHubリポジトリを取得
   */
  getAllRepositories = async (req: Request, res: Response): Promise<void> => {
    try {
      const repositories =
        await this.githubRepositoryService.getAllRepositories();

      // レスポンスでアクセストークンを隠す
      const sanitizedRepositories = repositories.map((repo) => ({
        ...repo,
        access_token: repo.access_token ? "••••••••" : null,
        webhook_secret: repo.webhook_secret ? "••••••••" : null,
      }));

      res.status(200).json({
        success: true,
        data: sanitizedRepositories,
      });
    } catch (error) {
      console.error("リポジトリ一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "リポジトリ一覧の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * IDによるGitHubリポジトリの取得
   */
  getRepositoryById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: "無効なリポジトリIDです",
        });
        return;
      }

      const repository = await this.githubRepositoryService.getRepositoryById(
        id
      );
      if (!repository) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      // アクセストークンを隠す
      const sanitizedRepository = {
        ...repository,
        access_token: repository.access_token ? "••••••••" : null,
        webhook_secret: repository.webhook_secret ? "••••••••" : null,
      };

      res.status(200).json({
        success: true,
        data: sanitizedRepository,
      });
    } catch (error) {
      console.error(`リポジトリ取得エラー:`, error);
      res.status(500).json({
        success: false,
        message: "リポジトリの取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * 新しいGitHubリポジトリを登録
   */
  createRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      // リクエストデータのバリデーション
      const repositorySchema = z.object({
        owner: z.string().min(1, "オーナー名は必須です"),
        name: z.string().min(1, "リポジトリ名は必須です"),
        access_token: z.string().min(1, "アクセストークンは必須です"),
        webhook_secret: z.string().optional(),
        is_active: z.boolean().optional(),
        allow_auto_review: z.boolean().optional(),
      });

      const validatedData = repositorySchema.parse(req.body);

      // リポジトリの作成
      const repository = await this.githubRepositoryService.createRepository(
        validatedData
      );

      // アクセストークンを隠す
      const sanitizedRepository = {
        ...repository,
        access_token: "••••••••",
        webhook_secret: repository.webhook_secret ? "••••••••" : null,
      };

      res.status(201).json({
        success: true,
        message: "GitHubリポジトリが正常に登録されました",
        data: sanitizedRepository,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("リポジトリ作成エラー:", error);
        res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "リポジトリの作成中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * GitHubリポジトリを更新
   */
  updateRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: "無効なリポジトリIDです",
        });
        return;
      }

      // リクエストデータのバリデーション
      const updateSchema = z.object({
        access_token: z.string().optional(),
        webhook_secret: z.string().optional(),
        is_active: z.boolean().optional(),
        allow_auto_review: z.boolean().optional(),
      });

      const validatedData = updateSchema.parse(req.body);

      // リポジトリの更新
      const repository = await this.githubRepositoryService.updateRepository(
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

      // アクセストークンを隠す
      const sanitizedRepository = {
        ...repository,
        access_token: repository.access_token ? "••••••••" : null,
        webhook_secret: repository.webhook_secret ? "••••••••" : null,
      };

      res.status(200).json({
        success: true,
        message: "GitHubリポジトリが正常に更新されました",
        data: sanitizedRepository,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("リポジトリ更新エラー:", error);
        res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "リポジトリの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * GitHubリポジトリを削除
   */
  deleteRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: "無効なリポジトリIDです",
        });
        return;
      }

      // リポジトリの削除
      const result = await this.githubRepositoryService.deleteRepository(id);
      if (!result) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "GitHubリポジトリが正常に削除されました",
      });
    } catch (error) {
      console.error("リポジトリ削除エラー:", error);
      res.status(500).json({
        success: false,
        message: "リポジトリの削除中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * GitHubリポジトリの検証
   */
  validateRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      // リクエストデータのバリデーション
      const validateSchema = z.object({
        owner: z.string().min(1, "オーナー名は必須です"),
        name: z.string().min(1, "リポジトリ名は必須です"),
        access_token: z.string().min(1, "アクセストークンは必須です"),
      });

      const validatedData = validateSchema.parse(req.body);

      // APIクライアントを初期化
      this.githubService.initializeWithToken(validatedData.access_token);

      // リポジトリ情報を取得して存在確認
      const repoInfo = await this.githubService.getRepositoryInfo(
        validatedData.owner,
        validatedData.name
      );

      if (!repoInfo) {
        res.status(404).json({
          success: false,
          message: `リポジトリ ${validatedData.owner}/${validatedData.name} が見つかりません`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "リポジトリの検証に成功しました",
        data: {
          id: repoInfo.id,
          full_name: repoInfo.full_name,
          description: repoInfo.description,
          visibility: repoInfo.visibility,
          default_branch: repoInfo.default_branch,
          owner: {
            login: repoInfo.owner.login,
            id: repoInfo.owner.id,
            avatar_url: repoInfo.owner.avatar_url,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("リポジトリ検証エラー:", error);
        res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "リポジトリの検証中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 特定オーナーのリポジトリ一覧を取得
   */
  getRepositoriesByOwner = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { owner } = req.params;
      if (!owner) {
        res.status(400).json({
          success: false,
          message: "オーナー名は必須です",
        });
        return;
      }

      const repositories =
        await this.githubRepositoryService.getRepositoriesByOwner(owner);

      // アクセストークンを隠す
      const sanitizedRepositories = repositories.map((repo) => ({
        ...repo,
        access_token: repo.access_token ? "••••••••" : null,
        webhook_secret: repo.webhook_secret ? "••••••••" : null,
      }));

      res.status(200).json({
        success: true,
        data: sanitizedRepositories,
      });
    } catch (error) {
      console.error(
        `オーナー ${req.params.owner} のリポジトリ取得エラー:`,
        error
      );
      res.status(500).json({
        success: false,
        message: "リポジトリ一覧の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };
}
