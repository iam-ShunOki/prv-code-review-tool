// backend/src/controllers/RepositoryWhitelistController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { RepositoryWhitelistService } from "../services/RepositoryWhitelistService";
import { BacklogService } from "../services/BacklogService";

export class RepositoryWhitelistController {
  private whitelistService: RepositoryWhitelistService;
  private backlogService: BacklogService;

  constructor() {
    this.whitelistService = RepositoryWhitelistService.getInstance();
    this.backlogService = new BacklogService();
  }

  /**
   * ホワイトリスト一覧を取得
   */
  getWhitelist = async (req: Request, res: Response): Promise<void> => {
    try {
      const whitelist = await this.whitelistService.getWhitelist();

      res.status(200).json({
        success: true,
        data: whitelist,
      });
    } catch (error) {
      console.error("ホワイトリスト取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "ホワイトリストの取得中にエラーが発生しました",
      });
    }
  };

  /**
   * リポジトリをホワイトリストに追加
   */
  addToWhitelist = async (req: Request, res: Response): Promise<void> => {
    try {
      const schema = z.object({
        projectKey: z.string().min(1, "プロジェクトキーは必須です"),
        repositoryName: z.string().min(1, "リポジトリ名は必須です"),
        allowAutoReply: z.boolean().default(true),
        notes: z.string().optional(),
      });

      const validatedData = schema.parse(req.body);
      const adminName = (req.user as any)?.name || "Unknown Admin";

      // リポジトリの存在確認
      try {
        await this.backlogService.getRepositories(validatedData.projectKey);
      } catch (error) {
        res.status(400).json({
          success: false,
          message: `プロジェクト '${validatedData.projectKey}' の取得に失敗しました`,
        });
        return;
      }

      const result = await this.whitelistService.addRepository(
        validatedData.projectKey,
        validatedData.repositoryName,
        validatedData.allowAutoReply,
        adminName,
        validatedData.notes
      );

      res.status(200).json({
        success: true,
        message: "リポジトリをホワイトリストに追加しました",
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("ホワイトリスト追加エラー:", error);
        res.status(500).json({
          success: false,
          message: "リポジトリのホワイトリスト追加中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 自動返信設定を更新
   */
  updateAutoReplySettings = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const schema = z.object({
        projectKey: z.string().min(1, "プロジェクトキーは必須です"),
        repositoryName: z.string().min(1, "リポジトリ名は必須です"),
        allowAutoReply: z.boolean(),
      });

      const validatedData = schema.parse(req.body);

      const result = await this.whitelistService.updateAutoReplySettings(
        validatedData.projectKey,
        validatedData.repositoryName,
        validatedData.allowAutoReply
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `リポジトリの自動返信設定を${
          validatedData.allowAutoReply ? "有効" : "無効"
        }に更新しました`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("自動返信設定更新エラー:", error);
        res.status(500).json({
          success: false,
          message: "自動返信設定の更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * リポジトリをホワイトリストから削除
   */
  removeFromWhitelist = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectKey, repositoryName } = req.params;

      if (!projectKey || !repositoryName) {
        res.status(400).json({
          success: false,
          message: "プロジェクトキーとリポジトリ名は必須です",
        });
        return;
      }

      const result = await this.whitelistService.removeRepository(
        projectKey,
        repositoryName
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: "リポジトリが見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "リポジトリをホワイトリストから削除しました",
      });
    } catch (error) {
      console.error("ホワイトリスト削除エラー:", error);
      res.status(500).json({
        success: false,
        message: "ホワイトリストからの削除中にエラーが発生しました",
      });
    }
  };

  /**
   * リポジトリのホワイトリスト状態を確認
   */
  checkRepository = async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectKey, repositoryName } = req.params;

      if (!projectKey || !repositoryName) {
        res.status(400).json({
          success: false,
          message: "プロジェクトキーとリポジトリ名は必須です",
        });
        return;
      }

      const isWhitelisted = await this.whitelistService.isWhitelisted(
        projectKey,
        repositoryName
      );
      const isAutoReplyAllowed = await this.whitelistService.isAutoReplyAllowed(
        projectKey,
        repositoryName
      );

      res.status(200).json({
        success: true,
        data: {
          projectKey,
          repositoryName,
          isWhitelisted,
          isAutoReplyAllowed,
        },
      });
    } catch (error) {
      console.error("リポジトリ確認エラー:", error);
      res.status(500).json({
        success: false,
        message: "リポジトリの確認中にエラーが発生しました",
      });
    }
  };
}
