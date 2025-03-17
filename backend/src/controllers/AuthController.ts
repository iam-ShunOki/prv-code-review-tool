import { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "../services/AuthService";
import { UserService } from "../services/UserService";

declare global {
  namespace Express {
    interface Request {
      sessionToken?: string;
    }
  }
}

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * ユーザー登録
   */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const registerSchema = z.object({
        name: z.string().min(1, "名前は必須です"),
        email: z.string().email("有効なメールアドレスを入力してください"),
        password: z.string().min(6, "パスワードは6文字以上必要です"),
        department: z.string().optional(),
        join_year: z.number().optional(),
      });

      const validatedData = registerSchema.parse(req.body);

      // ユーザー登録処理
      const result = await this.authService.register(validatedData);

      res.status(201).json({
        success: true,
        message: "ユーザー登録が完了しました",
        data: result,
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
   * ログイン
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const loginSchema = z.object({
        email: z.string().email("有効なメールアドレスを入力してください"),
        password: z.string().min(1, "パスワードは必須です"),
      });

      const validatedData = loginSchema.parse(req.body);

      // ログイン処理
      const result = await this.authService.login(
        validatedData.email,
        validatedData.password
      );

      res.status(200).json({
        success: true,
        message: "ログインに成功しました",
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(401).json({
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
   * 現在のユーザー情報を取得
   */
  getCurrentUser = async (req: Request, res: Response): Promise<void> => {
    try {
      // 認証ミドルウェアで設定されたユーザー情報を使用
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // UserServiceを使って完全なユーザー情報を取得
      const userService = new UserService();
      const user = await userService.findById(req.user.id);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "ユーザーが見つかりません",
        });
        return;
      }

      // パスワードを除外
      const { password, ...userWithoutPassword } = user;

      res.status(200).json({
        success: true,
        data: { user: userWithoutPassword },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "ユーザー情報取得中にエラーが発生しました",
      });
    }
  };

  /**
   * ログアウト
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      // req.sessionTokenにアクセスするために型アサーションを使用
      const sessionToken = (req as any).sessionToken;

      if (!sessionToken) {
        res.status(400).json({
          success: false,
          message: "セッショントークンが必要です",
        });
        return;
      }

      // セッションを削除
      await this.authService.logout(sessionToken);

      res.status(200).json({
        success: true,
        message: "ログアウトしました",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "ログアウト処理中にエラーが発生しました",
      });
    }
  };
}
