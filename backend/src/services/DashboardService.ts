// backend/src/services/DashboardService.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { User, UserRole } from "../models/User";
import { Feedback } from "../models/Feedback";
import { Evaluation, SkillLevel } from "../models/Evaluation";
import { CodeSubmission } from "../models/CodeSubmission";

export class DashboardService {
  private reviewRepository = AppDataSource.getRepository(Review);
  private userRepository = AppDataSource.getRepository(User);
  private feedbackRepository = AppDataSource.getRepository(Feedback);
  private evaluationRepository = AppDataSource.getRepository(Evaluation);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);

  /**
   * ダッシュボード統計情報を取得
   */
  async getDashboardStats(userId: number, isAdmin: boolean): Promise<any> {
    try {
      if (isAdmin) {
        return this.getAdminDashboardStats();
      } else {
        return this.getUserDashboardStats(userId);
      }
    } catch (error) {
      console.error("ダッシュボード統計情報取得エラー:", error);
      // エラー時は最小限の情報を返す
      if (isAdmin) {
        return {
          pendingReviews: 0,
          totalReviews: 0,
          registeredEmployees: 0,
        };
      } else {
        return {
          waitingReviews: 0,
          feedbackCount: 0,
          currentLevel: "C",
        };
      }
    }
  }

  /**
   * 管理者向けダッシュボード統計
   */
  private async getAdminDashboardStats(): Promise<any> {
    // 未レビュー件数を取得
    const pendingReviews = await this.reviewRepository.count({
      where: { status: ReviewStatus.PENDING },
    });

    // 累計レビュー数を取得
    const totalReviews = await this.reviewRepository.count();

    // 登録社員数（研修生）を取得
    const registeredEmployees = await this.userRepository.count({
      where: { role: UserRole.TRAINEE },
    });

    return {
      pendingReviews,
      totalReviews,
      registeredEmployees,
    };
  }

  /**
   * 一般ユーザー向けダッシュボード統計
   */
  private async getUserDashboardStats(userId: number): Promise<any> {
    try {
      // レビュー待ち件数を取得
      const waitingReviews = await this.reviewRepository.count({
        where: {
          user_id: userId,
          status: ReviewStatus.PENDING,
        },
      });

      // フィードバック件数を取得
      // 自分の全提出に対するフィードバック数を計算
      const feedbackCount = await this.feedbackRepository
        .createQueryBuilder("feedback")
        .innerJoin("feedback.submission", "submission")
        .innerJoin("submission.review", "review")
        .where("review.user_id = :userId", { userId })
        .getCount();

      // 現在のレベルを取得（最新の評価から）
      const latestEvaluation = await this.evaluationRepository.findOne({
        where: { user_id: userId },
        order: { created_at: "DESC" },
      });

      const currentLevel = latestEvaluation?.overall_level || "C";

      return {
        waitingReviews,
        feedbackCount,
        currentLevel,
      };
    } catch (error) {
      console.error(`ユーザー(${userId})の統計情報取得エラー:`, error);
      return {
        waitingReviews: 0,
        feedbackCount: 0,
        currentLevel: "C",
      };
    }
  }
}
