// backend/src/services/AnalyticsService.ts
import { AppDataSource } from "../index";
import { User, UserRole } from "../models/User";
import { Evaluation, SkillLevel } from "../models/Evaluation";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { CodeSubmission } from "../models/CodeSubmission";
import { Review } from "../models/Review";

export class AnalyticsService {
  private userRepository = AppDataSource.getRepository(User);
  private evaluationRepository = AppDataSource.getRepository(Evaluation);
  private feedbackRepository = AppDataSource.getRepository(Feedback);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private reviewRepository = AppDataSource.getRepository(Review);

  /**
   * ダッシュボード用のサマリー情報を取得
   */
  async getDashboardSummary(): Promise<any> {
    try {
      // 実データの取得（開発中はモックデータも使用）
      const traineeCount = await this.userRepository.count({
        where: { role: UserRole.TRAINEE },
      });

      const reviewCount = await this.reviewRepository.count();

      const submissionCount = await this.submissionRepository.count();

      // レベル別分布のカウント
      const levelCounts = await this.getSkillDistribution();

      // モックデータを追加（実データがある場合は省略可能）
      return {
        traineeCount,
        reviewCount,
        submissionCount,
        totalFeedbacks: submissionCount * 3, // 仮の数値
        skillDistribution: levelCounts,
        recentActivity: this.getMockRecentActivity(), // モックデータ
        topIssueTypes: this.getMockTopIssueTypes(), // モックデータ
      };
    } catch (error) {
      console.error("ダッシュボードサマリー取得エラー:", error);
      throw error;
    }
  }

  /**
   * スキルレベル分布を取得（実データ + モックデータ）
   */
  async getSkillDistribution(joinYear?: number): Promise<any> {
    try {
      // 実データの取得
      const query = this.evaluationRepository
        .createQueryBuilder("evaluation")
        .select("evaluation.overall_level", "level")
        .addSelect("COUNT(*)", "count")
        .groupBy("evaluation.overall_level")
        .orderBy("evaluation.overall_level", "ASC");

      if (joinYear) {
        query
          .innerJoin("evaluation.user", "user")
          .where("user.join_year = :joinYear", { joinYear });
      }

      const result = await query.getRawMany();

      // 結果を整形
      const levels = Object.values(SkillLevel);
      const distribution = levels.map((level) => {
        const found = result.find((r) => r.level === level);
        return {
          level,
          count: found ? parseInt(found.count) : 0,
        };
      });

      // データが少ない場合はモックデータを追加
      if (distribution.every((d) => d.count === 0)) {
        return this.getMockSkillDistribution();
      }

      return distribution;
    } catch (error) {
      console.error("スキル分布取得エラー:", error);
      // エラー時はモックデータを返す
      return this.getMockSkillDistribution();
    }
  }

  /**
   * 成長推移データを取得（実データ + モックデータ）
   */
  async getGrowthTrend(
    userId?: number,
    period: string = "6months"
  ): Promise<any> {
    try {
      // 実データの取得（ここでは簡略化）
      // 実際のアプリケーションでは、時系列データを取得し、グラフ用に加工

      // モックデータを使用
      return this.getMockGrowthTrend(period, userId);
    } catch (error) {
      console.error("成長推移取得エラー:", error);
      return this.getMockGrowthTrend(period, userId);
    }
  }

  /**
   * 問題点タイプ別統計情報を取得（実データ + モックデータ）
   */
  async getFeedbackTypeStats(period: string = "all"): Promise<any> {
    try {
      // 実データの取得（フィードバックを分析してカテゴリ分け）
      // 実際のアプリケーションでは、フィードバックの内容を分析して分類

      // モックデータを使用
      return this.getMockFeedbackTypeStats();
    } catch (error) {
      console.error("フィードバック統計取得エラー:", error);
      return this.getMockFeedbackTypeStats();
    }
  }

  /**
   * 特定社員の詳細分析情報を取得
   */
  async getEmployeeAnalytics(employeeId: number): Promise<any> {
    try {
      // 社員が存在するか確認
      const employee = await this.userRepository.findOne({
        where: { id: employeeId },
      });

      if (!employee) {
        return null;
      }

      // 社員のレビュー数
      const reviewCount = await this.reviewRepository.count({
        where: { user_id: employeeId },
      });

      // 社員の最新評価
      const latestEvaluation = await this.evaluationRepository.findOne({
        where: { user_id: employeeId },
        order: { created_at: "DESC" },
      });

      // 成長推移データ（モック）
      const growthTrend = this.getMockGrowthTrend("12months", employeeId);

      // スキル詳細（モック）
      const skillDetails = this.getMockSkillDetails();

      // フィードバック詳細（モック）
      const feedbackStats = this.getMockEmployeeFeedbackStats();

      return {
        employeeId,
        name: employee.name,
        email: employee.email,
        department: employee.department,
        joinYear: employee.join_year,
        reviewCount,
        currentLevel: latestEvaluation ? latestEvaluation.overall_level : "C",
        growthTrend,
        skillDetails,
        feedbackStats,
      };
    } catch (error) {
      console.error("社員分析情報取得エラー:", error);
      throw error;
    }
  }

  /**
   * エクスポート用のデータを取得
   */
  async getExportData(joinYear?: number, userId?: number): Promise<any> {
    try {
      const skillDistribution = await this.getSkillDistribution(joinYear);
      const growthTrend = await this.getGrowthTrend(
        userId,
        userId ? "12months" : "6months"
      );
      const feedbackStats = await this.getFeedbackTypeStats();

      let employeeData = null;
      if (userId) {
        employeeData = await this.getEmployeeAnalytics(userId);
      }

      return {
        exportDate: new Date().toISOString(),
        filterCriteria: {
          joinYear,
          userId,
        },
        data: {
          skillDistribution,
          growthTrend,
          feedbackStats,
          employeeData,
        },
      };
    } catch (error) {
      console.error("エクスポートデータ取得エラー:", error);
      throw error;
    }
  }

  /**
   * 新入社員ランキングを取得
   */
  async getTraineeRanking(
    joinYear?: number,
    limit: number = 10
  ): Promise<any[]> {
    // ユーザーリポジトリとスコアを計算するためのリポジトリ
    const userRepository = AppDataSource.getRepository(User);
    const evaluationRepository = AppDataSource.getRepository(Evaluation);

    // クエリビルダーを作成
    let query = userRepository
      .createQueryBuilder("user")
      .where("user.role = :role", { role: "trainee" })
      .leftJoinAndSelect(
        "user.evaluations",
        "evaluation",
        "evaluation.user_id = user.id"
      );

    // 入社年度でフィルタリング
    if (joinYear) {
      query = query.andWhere("user.join_year = :joinYear", { joinYear });
    }

    // 結果を取得
    const users = await query.getMany();

    // 各ユーザーの評価スコアを計算
    const rankingData = await Promise.all(
      users.map(async (user) => {
        // 最新の評価を取得
        const latestEvaluation = await evaluationRepository.findOne({
          where: { user_id: user.id },
          order: { created_at: "DESC" },
        });

        // 平均スコアを計算
        let averageScore = 0;
        let skillLevel = "N/A";

        if (latestEvaluation) {
          const scores = [
            latestEvaluation.code_quality_score,
            latestEvaluation.readability_score,
            latestEvaluation.efficiency_score,
            latestEvaluation.best_practices_score,
          ];
          averageScore =
            scores.reduce((sum, score) => sum + score, 0) / scores.length;
          skillLevel = latestEvaluation.overall_level;
        }

        // パスワードを除外
        const { password, ...userWithoutPassword } = user;

        return {
          ...userWithoutPassword,
          averageScore,
          skillLevel,
        };
      })
    );

    // スコアでソート
    const sortedRanking = rankingData
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, limit);

    return sortedRanking;
  }

  /**
   * モックデータ: スキルレベル分布
   */
  private getMockSkillDistribution(): any {
    return [
      { level: "A", count: 5 },
      { level: "B", count: 12 },
      { level: "C", count: 18 },
      { level: "D", count: 8 },
      { level: "E", count: 2 },
    ];
  }

  /**
   * モックデータ: 成長推移
   */
  private getMockGrowthTrend(period: string, userId?: number): any {
    // 期間に応じてデータポイント数を調整
    const dataPoints =
      period === "12months" ? 12 : period === "6months" ? 6 : 3;

    // 開始月を計算
    const today = new Date();
    const startMonth = new Date(
      today.getFullYear(),
      today.getMonth() - dataPoints,
      1
    );

    // ランダムな成長曲線を生成（ユーザーIDに基づいて一貫したデータを生成）
    const seed = userId || 123;
    const startValue = 40 + (seed % 30); // 40-70の範囲で開始

    const result = [];
    for (let i = 0; i < dataPoints; i++) {
      const date = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + i,
        1
      );

      // 徐々に上昇する値を生成（若干のランダム性を持たせる）
      const randomFactor = ((seed * (i + 1)) % 10) - 3; // -3から+6のランダム変動
      const growth = startValue + i * 4 + randomFactor;

      // スコアが100を超えないようにする
      const cappedGrowth = Math.min(growth, 100);

      result.push({
        month: date.toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "short",
        }),
        value: cappedGrowth,
      });
    }

    return result;
  }

  /**
   * モックデータ: フィードバックタイプ統計
   */
  private getMockFeedbackTypeStats(): any {
    return [
      { type: "コードスタイル", count: 35, percentage: 23 },
      { type: "パフォーマンス最適化", count: 28, percentage: 19 },
      { type: "セキュリティ", count: 22, percentage: 15 },
      { type: "エラーハンドリング", count: 18, percentage: 12 },
      { type: "命名規則", count: 15, percentage: 10 },
      { type: "ドキュメント", count: 12, percentage: 8 },
      { type: "アーキテクチャ", count: 11, percentage: 7 },
      { type: "その他", count: 9, percentage: 6 },
    ];
  }

  /**
   * モックデータ: 最近のアクティビティ
   */
  private getMockRecentActivity(): any {
    return [
      {
        id: 1,
        employeeName: "山田太郎",
        action: "レビュー完了",
        details: "レベルCからレベルBに昇格",
        timestamp: "2023-07-15T09:30:00Z",
      },
      {
        id: 2,
        employeeName: "佐藤花子",
        action: "新規コード提出",
        details: "第3回目の提出",
        timestamp: "2023-07-14T14:45:00Z",
      },
      {
        id: 3,
        employeeName: "鈴木一郎",
        action: "フィードバック対応完了",
        details: "セキュリティ問題の修正",
        timestamp: "2023-07-13T11:20:00Z",
      },
      {
        id: 4,
        employeeName: "高橋実",
        action: "レビュー開始",
        details: "初回コードレビュー",
        timestamp: "2023-07-12T16:10:00Z",
      },
      {
        id: 5,
        employeeName: "伊藤裕子",
        action: "レビュー完了",
        details: "コード品質スコア85点",
        timestamp: "2023-07-11T10:05:00Z",
      },
    ];
  }

  /**
   * モックデータ: トップの問題タイプ
   */
  private getMockTopIssueTypes(): any {
    return [
      { type: "命名規則違反", count: 42 },
      { type: "冗長なコード", count: 38 },
      { type: "コメント不足", count: 27 },
      { type: "セキュリティリスク", count: 23 },
      { type: "非効率なアルゴリズム", count: 19 },
    ];
  }

  /**
   * モックデータ: スキル詳細
   */
  private getMockSkillDetails(): any {
    return {
      codeQuality: { value: 78, improvement: 12 },
      readability: { value: 82, improvement: 8 },
      efficiency: { value: 65, improvement: 15 },
      bestPractices: { value: 70, improvement: 5 },
    };
  }

  /**
   * モックデータ: 社員別フィードバック統計
   */
  private getMockEmployeeFeedbackStats(): any {
    return {
      totalFeedbacks: 47,
      resolvedFeedbacks: 35,
      priorityDistribution: [
        { priority: "high", count: 12 },
        { priority: "medium", count: 23 },
        { priority: "low", count: 12 },
      ],
      typeDistribution: [
        { type: "コードスタイル", count: 15 },
        { type: "パフォーマンス", count: 10 },
        { type: "セキュリティ", count: 8 },
        { type: "エラーハンドリング", count: 7 },
        { type: "その他", count: 7 },
      ],
    };
  }
}
