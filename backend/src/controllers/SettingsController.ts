// backend/src/controllers/SettingsController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/UserService";
import { NotificationService } from "../services/NotificationService";

export class SettingsController {
  private userService: UserService;
  private notificationService: NotificationService;

  constructor() {
    this.userService = new UserService();
    this.notificationService = new NotificationService();
  }

  /**
   * ユーザープロフィールを更新
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 入力バリデーション
      const profileSchema = z.object({
        name: z.string().min(1, "名前は必須です"),
        email: z.string().email("有効なメールアドレスを入力してください"),
        department: z.string().optional(),
        join_year: z.number().optional(),
      });

      const validatedData = profileSchema.parse(req.body);

      // 他のユーザーと同じメールアドレスを使用していないか確認
      if (validatedData.email) {
        const existingUser = await this.userService.findByEmail(
          validatedData.email
        );
        if (existingUser && existingUser.id !== userId) {
          res.status(400).json({
            success: false,
            message: "このメールアドレスは既に使用されています",
          });
          return;
        }
      }

      // ユーザー情報を更新
      const updatedUser = await this.userService.updateUser(
        userId,
        validatedData
      );

      // パスワードを除外
      const { password, ...userWithoutPassword } = updatedUser;

      res.status(200).json({
        success: true,
        message: "プロフィールが更新されました",
        data: userWithoutPassword,
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
          message: "プロフィールの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * パスワードを変更
   */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 入力バリデーション
      const passwordSchema = z.object({
        current_password: z.string().min(1, "現在のパスワードは必須です"),
        new_password: z.string().min(6, "新しいパスワードは6文字以上必要です"),
      });

      const validatedData = passwordSchema.parse(req.body);

      // ユーザー情報を取得
      const user = await this.userService.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "ユーザーが見つかりません",
        });
        return;
      }

      // 現在のパスワードを検証
      const isPasswordValid = await this.userService.validatePassword(
        user,
        validatedData.current_password
      );

      if (!isPasswordValid) {
        res.status(400).json({
          success: false,
          message: "現在のパスワードが正しくありません",
        });
        return;
      }

      // パスワードを更新
      await this.userService.updatePassword(userId, validatedData.new_password);

      res.status(200).json({
        success: true,
        message: "パスワードが変更されました",
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
          message: "パスワードの変更中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 通知設定を取得
   */
  getNotificationSettings = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 通知設定を取得
      const settings = await this.notificationService.getNotificationSettings(
        userId
      );

      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error("通知設定取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "通知設定の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 通知設定を更新
   */
  updateNotificationSettings = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 入力バリデーション
      const notificationSchema = z.object({
        email_notifications: z.boolean(),
        review_completed: z.boolean(),
        feedback_received: z.boolean(),
        level_changed: z.boolean(),
        system_notifications: z.boolean(),
      });

      const validatedData = notificationSchema.parse(req.body);

      // 通知設定を更新
      const updatedSettings =
        await this.notificationService.updateNotificationSettings(
          userId,
          validatedData
        );

      res.status(200).json({
        success: true,
        message: "通知設定が更新されました",
        data: updatedSettings,
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
          message: "通知設定の更新中にエラーが発生しました",
        });
      }
    }
  };
}
