// backend/src/controllers/BacklogController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { BacklogService } from "../services/BacklogService";

export class BacklogController {
  private backlogService: BacklogService;

  constructor() {
    this.backlogService = new BacklogService();
  }

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
   * バックログ連携のステータスを確認
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
}
