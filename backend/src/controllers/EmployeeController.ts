// backend/src/controllers/EmployeeController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/UserService";
import { In, Like } from "typeorm";
import { UserRole } from "../models/User";

export class EmployeeController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * 全社員一覧を取得（管理者向け）
   */
  getAllEmployees = async (req: Request, res: Response): Promise<void> => {
    try {
      // クエリパラメータからフィルタリング条件を取得
      const joinYear = req.query.joinYear
        ? parseInt(req.query.joinYear as string)
        : undefined;

      const department = req.query.department as string | undefined;

      // フィルタリング条件に基づいて社員を取得
      const employees = await this.userService.getFilteredEmployees(
        joinYear,
        department
      );

      res.status(200).json({
        success: true,
        data: employees,
      });
    } catch (error) {
      console.error("社員一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "社員一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 特定の社員情報を取得
   */
  getEmployeeById = async (req: Request, res: Response): Promise<void> => {
    try {
      const employeeId = parseInt(req.params.id);
      const employee = await this.userService.findById(employeeId);

      if (!employee) {
        res.status(404).json({
          success: false,
          message: "社員が見つかりません",
        });
        return;
      }

      // パスワードフィールドを除外
      const { password, ...employeeWithoutPassword } = employee;

      res.status(200).json({
        success: true,
        data: employeeWithoutPassword,
      });
    } catch (error) {
      console.error("社員情報取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "社員情報の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 社員情報を更新
   */
  updateEmployee = async (req: Request, res: Response): Promise<void> => {
    try {
      const employeeId = parseInt(req.params.id);

      // バリデーションスキーマ
      const updateSchema = z.object({
        name: z.string().min(1, "名前は必須です").optional(),
        email: z
          .string()
          .email("有効なメールアドレスを入力してください")
          .optional(),
        department: z.string().optional(),
        join_year: z.number().optional(),
        role: z.enum([UserRole.ADMIN, UserRole.TRAINEE]).optional(),
      });

      const validatedData = updateSchema.parse(req.body);

      // ユーザーが存在するか確認
      const existingEmployee = await this.userService.findById(employeeId);
      if (!existingEmployee) {
        res.status(404).json({
          success: false,
          message: "社員が見つかりません",
        });
        return;
      }

      // 社員情報を更新
      const updatedEmployee = await this.userService.updateUser(
        employeeId,
        validatedData
      );

      // パスワードフィールドを除外
      const { password, ...employeeWithoutPassword } = updatedEmployee;

      res.status(200).json({
        success: true,
        message: "社員情報が更新されました",
        data: employeeWithoutPassword,
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
          message: "社員情報の更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 社員パスワードをリセット
   */
  resetEmployeePassword = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const employeeId = parseInt(req.params.id);

      // バリデーション
      const resetSchema = z.object({
        new_password: z.string().min(6, "パスワードは6文字以上必要です"),
      });

      const validatedData = resetSchema.parse(req.body);

      // ユーザーが存在するか確認
      const existingEmployee = await this.userService.findById(employeeId);
      if (!existingEmployee) {
        res.status(404).json({
          success: false,
          message: "社員が見つかりません",
        });
        return;
      }

      // パスワードを更新
      await this.userService.updatePassword(
        employeeId,
        validatedData.new_password
      );

      res.status(200).json({
        success: true,
        message: "パスワードがリセットされました",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "パスワードリセット中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 入社年度一覧を取得
   */
  getJoinYears = async (req: Request, res: Response): Promise<void> => {
    try {
      const joinYears = await this.userService.getDistinctJoinYears();

      res.status(200).json({
        success: true,
        data: joinYears,
      });
    } catch (error) {
      console.error("入社年度一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "入社年度一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 部署一覧を取得
   */
  getDepartments = async (req: Request, res: Response): Promise<void> => {
    try {
      const departments = await this.userService.getDistinctDepartments();

      res.status(200).json({
        success: true,
        data: departments,
      });
    } catch (error) {
      console.error("部署一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "部署一覧の取得中にエラーが発生しました",
      });
    }
  };
}
