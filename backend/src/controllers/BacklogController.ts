// backend/src/controllers/BacklogController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { BacklogService } from "../services/BacklogService";
import { RepositoryVectorSearchService } from "../services/RepositoryVectorSearchService";
import { ReviewFeedbackSenderService } from "../services/ReviewFeedbackSenderService";
import {
  BacklogRepository,
  RepositoryStatus,
} from "../models/BacklogRepository";
import { AppDataSource } from "../index";

export class BacklogController {
  private backlogService: BacklogService;
  private repositoryVectorService: RepositoryVectorSearchService;
  private reviewFeedbackSenderService: ReviewFeedbackSenderService;
  private backlogRepositoryRepository =
    AppDataSource.getRepository(BacklogRepository);

  constructor() {
    this.backlogService = new BacklogService();
    this.repositoryVectorService = new RepositoryVectorSearchService();
    this.reviewFeedbackSenderService = new ReviewFeedbackSenderService();
  }

  /**
   * Backlog接続ステータスを確認
   */
  checkConnectionStatus = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // Backlog APIとの接続をテスト
      await this.backlogService.getProjects();

      res.status(200).json({
        success: true,
        message: "Backlog APIとの接続は正常です",
        data: {
          connected: true,
          spaceKey: process.env.BACKLOG_SPACE,
        },
      });
    } catch (error) {
      console.error("Backlog接続確認エラー:", error);
      res.status(200).json({
        success: true,
        message: "Backlog APIとの接続に問題があります",
        data: {
          connected: false,
          spaceKey: process.env.BACKLOG_SPACE,
          error: error instanceof Error ? error.message : "不明なエラー",
        },
      });
    }
  };

  /**
   * プロジェクト一覧を取得
   */
  getProjects = async (req: Request, res: Response): Promise<void> => {
    try {
      const projects = await this.backlogService.getProjects();
      res.status(200).json({
        success: true,
        data: projects,
      });
    } catch (error) {
      console.error("プロジェクト一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "プロジェクト一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * リポジトリ一覧を取得
   */
  getRepositories = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectIdOrKey = req.params.projectId;
      const repositories = await this.backlogService.getRepositories(
        projectIdOrKey
      );
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
   * コード変更をプルリクエストとして提出
   */
  submitCodeChanges = async (req: Request, res: Response): Promise<void> => {
    try {
      // バリデーションスキーマ
      const submitSchema = z.object({
        reviewId: z.number(),
        projectId: z.string(),
        repositoryId: z.string(),
        baseBranch: z.string().optional(),
      });

      const validatedData = submitSchema.parse(req.body);

      // コード変更をプルリクエストとして提出
      const pullRequest = await this.backlogService.submitCodeChanges(
        validatedData.reviewId,
        validatedData.projectId,
        validatedData.repositoryId,
        validatedData.baseBranch || "master"
      );

      res.status(200).json({
        success: true,
        message: "プルリクエストが作成されました",
        data: pullRequest,
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
          message: "プルリクエスト作成中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * リポジトリをベクトル化する
   */
  vectorizeRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const vectorizeSchema = z.object({
        projectKey: z.string(),
        repositoryName: z.string(),
        branch: z.string().optional(),
      });

      const validatedData = vectorizeSchema.parse(req.body);
      const { projectKey, repositoryName, branch = "master" } = validatedData;

      // リポジトリをベクトル化
      const collectionName =
        await this.repositoryVectorService.vectorizeRepository(
          projectKey,
          repositoryName,
          branch
        );

      res.status(200).json({
        success: true,
        message: "リポジトリがベクトル化されました",
        data: { collectionName },
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
          message: "リポジトリのベクトル化中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 類似コードを検索
   */
  searchSimilarCode = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const searchSchema = z.object({
        collectionName: z.string(),
        query: z.string(),
        limit: z.number().optional(),
      });

      const validatedData = searchSchema.parse(req.body);
      const { collectionName, query, limit = 5 } = validatedData;

      // 類似コードを検索
      const results = await this.repositoryVectorService.searchSimilarCode(
        collectionName,
        query,
        limit
      );

      res.status(200).json({
        success: true,
        data: results,
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
          message: "類似コードの検索中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * レビュー結果をプルリクエストに手動で送信
   */
  sendFeedbackToBacklog = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 入力バリデーション
      const feedbackSchema = z.object({
        reviewId: z.number(),
      });

      const validatedData = feedbackSchema.parse(req.body);
      const { reviewId } = validatedData;

      // フィードバックを送信
      const result =
        await this.reviewFeedbackSenderService.sendReviewFeedbackToPullRequest(
          reviewId
        );

      if (result) {
        res.status(200).json({
          success: true,
          message: "レビュー結果をBacklogに送信しました",
        });
      } else {
        res.status(400).json({
          success: false,
          message: "レビュー結果の送信に失敗しました",
        });
      }
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
          message: "レビュー結果の送信中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * ブランチ一覧を取得
   */
  getBranches = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectIdOrKey = req.params.projectId;
      const repoIdOrName = req.params.repoId;

      const branches = await this.backlogService.getBranches(
        projectIdOrKey,
        repoIdOrName
      );

      res.status(200).json({
        success: true,
        data: branches,
      });
    } catch (error) {
      console.error("ブランチ一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "ブランチ一覧の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * ファイルツリーを取得
   */
  getFileTree = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectIdOrKey = req.params.projectId;
      const repoIdOrName = req.params.repoId;
      const { branch = "master", path = "" } = req.query;

      const fileTree = await this.backlogService.getFileTree(
        projectIdOrKey,
        repoIdOrName,
        branch as string,
        path as string
      );

      res.status(200).json({
        success: true,
        data: fileTree,
      });
    } catch (error) {
      console.error("ファイルツリー取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "ファイルツリーの取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * プルリクエストのコメント一覧を取得（新機能）
   */
  getPullRequestComments = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const projectIdOrKey = req.params.projectId;
      const repoIdOrName = req.params.repoId;
      const pullRequestId = parseInt(req.params.pullRequestId);
      const count = req.query.count
        ? parseInt(req.query.count as string)
        : undefined;
      const order = (req.query.order as "asc" | "desc") || "desc";

      const comments = await this.backlogService.getPullRequestComments(
        projectIdOrKey,
        repoIdOrName,
        pullRequestId,
        { count, order }
      );

      res.status(200).json({
        success: true,
        data: comments,
      });
    } catch (error) {
      console.error("プルリクエストコメント取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "プルリクエストコメントの取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * リポジトリとプロジェクトの関連付けを更新（新機能）
   */
  updateRepositoryProjectMapping = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 入力バリデーション
      const mappingSchema = z.object({
        repositoryId: z.number(),
        projectKey: z.string(),
        repositoryName: z.string(),
        mainBranch: z.string().optional(),
      });

      const validatedData = mappingSchema.parse(req.body);

      // 関連付けを更新
      const updatedRepository =
        await this.backlogService.updateRepositoryProjectMapping(
          validatedData.repositoryId,
          validatedData.projectKey,
          validatedData.repositoryName,
          validatedData.mainBranch || "master"
        );

      res.status(200).json({
        success: true,
        message: "リポジトリとプロジェクトの関連付けを更新しました",
        data: updatedRepository,
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
          message: "関連付けの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 手動でリポジトリマッピングを作成（新機能）
   */
  createManualRepositoryMapping = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 入力バリデーション
      const mappingSchema = z.object({
        projectKey: z.string(),
        projectName: z.string(),
        repositoryName: z.string(),
        mainBranch: z.string().optional(),
        description: z.string().optional(),
      });

      const validatedData = mappingSchema.parse(req.body);

      // 既存のマッピングがあるか確認
      let repository = await this.backlogRepositoryRepository.findOne({
        where: {
          project_key: validatedData.projectKey,
          repository_name: validatedData.repositoryName,
        },
      });

      if (repository) {
        // 既存のマッピングを更新
        repository.project_name = validatedData.projectName;
        repository.main_branch = validatedData.mainBranch || "master";
        repository.description = validatedData.description || null;
        repository.is_active = true;

        const updatedRepository = await this.backlogRepositoryRepository.save(
          repository
        );

        res.status(200).json({
          success: true,
          message: "既存のリポジトリマッピングを更新しました",
          data: updatedRepository,
        });
      } else {
        // 新規マッピングを作成
        const newRepository = this.backlogRepositoryRepository.create({
          project_key: validatedData.projectKey,
          project_name: validatedData.projectName,
          repository_name: validatedData.repositoryName,
          main_branch: validatedData.mainBranch || "master",
          description: validatedData.description || null,
          status: RepositoryStatus.REGISTERED,
          is_active: true,
          vectorstore_collection:
            `backlog_${validatedData.projectKey}_${validatedData.repositoryName}`.replace(
              /[^a-zA-Z0-9_]/g,
              "_"
            ),
        });

        const savedRepository = await this.backlogRepositoryRepository.save(
          newRepository
        );

        res.status(201).json({
          success: true,
          message: "新規リポジトリマッピングを作成しました",
          data: savedRepository,
        });
      }
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
          message: "リポジトリマッピングの作成中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * リポジトリマッピング一覧を取得（新機能）
   */
  getRepositoryMappings = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const repositories = await this.backlogRepositoryRepository.find({
        where: { is_active: true },
        order: { updated_at: "DESC" },
      });

      res.status(200).json({
        success: true,
        data: repositories,
      });
    } catch (error) {
      console.error("リポジトリマッピング一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "リポジトリマッピング一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * ファイル内容を取得（新機能）
   */
  getFileContent = async (req: Request, res: Response): Promise<void> => {
    try {
      const projectIdOrKey = req.params.projectId;
      const repoIdOrName = req.params.repoId;
      const filePath = req.query.path as string;
      const branch = (req.query.branch as string) || "master";

      if (!filePath) {
        res.status(400).json({
          success: false,
          message: "filePathパラメータは必須です",
        });
        return;
      }

      const fileContent = await this.backlogService.getFileContent(
        projectIdOrKey,
        repoIdOrName,
        filePath,
        branch
      );

      res.status(200).json({
        success: true,
        data: {
          path: filePath,
          content: fileContent,
        },
      });
    } catch (error) {
      console.error("ファイル内容取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "ファイル内容の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };
}
