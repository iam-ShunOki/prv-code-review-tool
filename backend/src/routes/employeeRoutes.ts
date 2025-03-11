// backend/src/routes/employeeRoutes.ts

import express from "express";
import { EmployeeController } from "../controllers/EmployeeController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const employeeController = new EmployeeController();

// 全てのAPIに認証と管理者権限チェックを適用
router.use(authenticate, requireAdmin);

// 社員一覧を取得
router.get("/", employeeController.getAllEmployees);

// 入社年度一覧を取得
router.get("/join-years", employeeController.getJoinYears);

// 部署一覧を取得
router.get("/departments", employeeController.getDepartments);

// 特定の社員を取得
router.get("/:id", employeeController.getEmployeeById);

// 社員情報を更新
router.patch("/:id", employeeController.updateEmployee);

// 社員パスワードをリセット
router.post("/:id/reset-password", employeeController.resetEmployeePassword);

export default router;
