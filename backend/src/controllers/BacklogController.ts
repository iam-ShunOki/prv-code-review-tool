// backend/src/controllers/BacklogController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { BacklogService } from "../services/BacklogService";
import { RepositoryVectorSearchService } from "../services/RepositoryVectorSearchService";
import { ReviewFeedbackSenderService } from "../services/ReviewFeedbackSenderService";

export class BacklogController {
  private backlogService: BacklogService;
  private repositoryVectorService: RepositoryVectorSearchService;
  private reviewFeedbackSenderService: ReviewFeedbackSenderService;

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
          error: error instanceof Error ? error.message : "Unknown error",
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
}
