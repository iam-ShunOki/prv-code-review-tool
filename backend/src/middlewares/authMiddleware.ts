// backend/src/middlewares/authMiddleware.ts (認証ミドルウェア修正)

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserService } from "../services/UserService";

interface JwtPayload {
  id: number;
  email: string;
  role: string;
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Authorizationヘッダーを取得
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.warn("Authentication failed: No authorization header");
      return res.status(401).json({
        success: false,
        message: "認証されていません",
      });
    }

    // Bearer トークンから実際のトークン部分を取得
    const token = authHeader.split(" ")[1];
    if (!token) {
      console.warn("Authentication failed: Token not found in header");
      return res.status(401).json({
        success: false,
        message: "認証トークンがありません",
      });
    }

    try {
      // トークンを検証
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "default_secret"
      ) as JwtPayload;

      // デバッグ情報
      console.log(`認証成功: ユーザーID=${decoded.id}, ロール=${decoded.role}`);

      // リクエストオブジェクトにユーザー情報を追加
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      };

      // 次のミドルウェアに進む
      next();
    } catch (error) {
      // トークン検証エラー
      console.error("Authentication failed: Token verification error", error);
      return res.status(401).json({
        success: false,
        message: "無効なトークンです",
      });
    }
  } catch (error) {
    // 予期せぬエラー
    console.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "認証処理中にエラーが発生しました",
    });
  }
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 認証ミドルウェアで追加されたユーザー情報を取得
    const user = req.user;

    // ユーザー情報がない場合（認証されていない）
    if (!user) {
      console.warn("Admin check failed: User not authenticated");
      return res.status(401).json({
        success: false,
        message: "認証されていません",
      });
    }

    // 管理者権限を確認
    if (user.role !== "admin") {
      console.warn(
        `Admin check failed: User ${user.id} is not an admin (role: ${user.role})`
      );
      return res.status(403).json({
        success: false,
        message: "この操作には管理者権限が必要です",
      });
    }

    // 管理者確認OK
    console.log(`Admin check passed: User ${user.id}`);
    next();
  } catch (error) {
    // 予期せぬエラー
    console.error("Admin check error:", error);
    return res.status(500).json({
      success: false,
      message: "権限チェック中にエラーが発生しました",
    });
  }
};

// Request型の拡張
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role: string;
      };
    }
  }
}
