import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/AuthService";
import { UserRole } from "../models/User";

// Requestオブジェクトに認証済みユーザー情報を拡張
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: UserRole;
      };
      sessionToken?: string;
    }
  }
}

/**
 * セッション認証ミドルウェア
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Authorization ヘッダーからセッショントークンを取得
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "認証トークンが必要です",
      });
      return;
    }

    const sessionToken = authHeader.split(" ")[1];

    // セッションの検証
    const authService = new AuthService();
    const user = await authService.validateSession(sessionToken);

    if (!user) {
      res.status(401).json({
        success: false,
        message: "無効または期限切れのセッションです",
      });
      return;
    }

    // リクエストオブジェクトにユーザー情報とセッショントークンを追加
    req.user = {
      id: user.id,
      role: user.role,
    };
    req.sessionToken = sessionToken;

    next();
  } catch (error) {
    console.error("認証エラー:", error);
    res.status(401).json({
      success: false,
      message: "認証に失敗しました",
    });
  }
};

/**
 * 管理者権限チェックミドルウェア
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    res.status(403).json({
      success: false,
      message: "管理者権限が必要です",
    });
    return;
  }

  next();
};
