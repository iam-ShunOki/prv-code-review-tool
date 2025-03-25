// backend/src/controllers/DashboardController.ts
import { Request, Response } from "express";
import { DashboardService } from "../services/DashboardService";

export class DashboardController {
  private dashboardService: DashboardService;

  constructor() {
    this.dashboardService = new DashboardService();
  }

  /**
   * ダッシュボード統計情報を取得
   */
  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const isAdmin = req.user?.role === "admin";
      const stats = await this.dashboardService.getDashboardStats(
        userId,
        isAdmin
      );

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("ダッシュボード統計情報取得API処理エラー:", error);

      res.status(500).json({
        success: false,
        message: "ダッシュボード統計情報の取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
