// backend/src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/AuthService";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get the session token from the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.warn("Authentication failed: No authorization header");
      return res.status(401).json({
        success: false,
        message: "認証されていません",
      });
    }

    // Extract the token - either from Bearer format or directly
    let token = authHeader;
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      console.warn("Authentication failed: Token not found in header");
      return res.status(401).json({
        success: false,
        message: "認証トークンがありません",
      });
    }

    // Store the token for later use (e.g., in logout)
    req.sessionToken = token;

    // Validate the session using the AuthService
    const authService = new AuthService();
    const user = await authService.validateSession(token);

    if (!user) {
      console.warn("Authentication failed: Invalid or expired session token");
      return res.status(401).json({
        success: false,
        message: "無効なトークンです",
      });
    }

    // Add user info to the request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    // Debug log
    console.log(`認証成功: ユーザーID=${user.id}, ロール=${user.role}`);

    // Proceed to the next middleware
    next();
  } catch (error) {
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
      sessionToken?: string;
    }
  }
}
