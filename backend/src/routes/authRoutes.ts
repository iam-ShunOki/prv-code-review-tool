import express from "express";
import { AuthController } from "../controllers/AuthController";
import { authenticate } from "../middlewares/authMiddleware";

const router = express.Router();
const authController = new AuthController();

// ユーザー登録
router.post("/register", authController.register);

// ログイン
router.post("/login", authController.login);

// 現在のユーザー情報の取得（認証が必要）
router.get("/me", authenticate, authController.getCurrentUser);

// ログアウト（認証が必要）
router.post("/logout", authenticate, authController.logout);

export default router;
