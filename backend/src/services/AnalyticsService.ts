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
   * スキルレベル分布を取得
   */
  async getSkillDistribution(
    joinYear?: number,
    department?: string
  ): Promise<any[]> {
    try {
      // TypeORMクエリビルダーを使用して、スキルレベル別の人数を集計
      const queryBuilder = this.evaluationRepository
        .createQueryBuilder("evaluation")
        .select("evaluation.overall_level", "level")
        .addSelect("COUNT(DISTINCT evaluation.user_id)", "count")
        .leftJoin("evaluation.user", "user");

      // フィルタリング条件を追加
      const whereConditions: string[] = [];
      const parameters: any = {};

      if (joinYear) {
        whereConditions.push("user.join_year = :joinYear");
        parameters.joinYear = joinYear;
      }

      if (department) {
        whereConditions.push("user.department = :department");
        parameters.department = department;
      }

      // サブクエリで最新の評価のみを取得
      whereConditions.push(
        "(evaluation.id IN (" +
          "SELECT MAX(e.id) FROM evaluations e " +
          "WHERE e.user_id = evaluation.user_id GROUP BY e.user_id" +
          "))"
      );

      // WHERE条件を適用
      if (whereConditions.length > 0) {
        queryBuilder.where(whereConditions.join(" AND "), parameters);
      }

      // グループ化して結果を取得
      const result = await queryBuilder
        .groupBy("evaluation.overall_level")
        .orderBy("level", "ASC")
        .getRawMany();

      // 結果にすべてのレベルが含まれているか確認し、不足しているレベルを追加
      const allLevels = ["A", "B", "C", "D", "E"];
      const distributionMap = new Map(
        result.map((item) => [item.level, parseInt(item.count)])
      );

      const fullDistribution = allLevels.map((level) => ({
        level,
        count: distributionMap.get(level) || 0,
      }));

      return fullDistribution;
    } catch (error) {
      console.error("スキルレベル分布取得エラー:", error);
      return [
        { level: "A", count: 0 },
        { level: "B", count: 0 },
        { level: "C", count: 0 },
        { level: "D", count: 0 },
        { level: "E", count: 0 },
      ];
    }
  }

  /**
   * 成長推移データを取得
   */
  async getGrowthTrend(joinYear?: number, department?: string): Promise<any[]> {
    try {
      // 6ヶ月分の月次データを生成
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 5); // 6ヶ月前から

      const months = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        months.push(new Date(currentDate));
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // 各月のスキルレベル平均を取得
      const results = await Promise.all(
        months.map(async (month) => {
          const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
          const monthEnd = new Date(
            month.getFullYear(),
            month.getMonth() + 1,
            0
          );

          const queryBuilder = this.evaluationRepository
            .createQueryBuilder("evaluation")
            .select(
              "AVG(CASE " +
                "WHEN evaluation.overall_level = 'A' THEN 5 " +
                "WHEN evaluation.overall_level = 'B' THEN 4 " +
                "WHEN evaluation.overall_level = 'C' THEN 3 " +
                "WHEN evaluation.overall_level = 'D' THEN 2 " +
                "WHEN evaluation.overall_level = 'E' THEN 1 " +
                "ELSE 0 END)",
              "averageLevel"
            )
            .leftJoin("evaluation.user", "user")
            .where("evaluation.created_at BETWEEN :start AND :end", {
              start: monthStart,
              end: monthEnd,
            });

          // フィルタリング条件を追加
          if (joinYear) {
            queryBuilder.andWhere("user.join_year = :joinYear", { joinYear });
          }

          if (department) {
            queryBuilder.andWhere("user.department = :department", {
              department,
            });
          }

          const result = await queryBuilder.getRawOne();

          return {
            period: `${month.getFullYear()}/${month.getMonth() + 1}`,
            year: month.getFullYear(),
            month: month.getMonth() + 1,
            averageLevel: result?.averageLevel
              ? parseFloat(result.averageLevel)
              : 0,
          };
        })
      );

      // 成長率を計算
      const trendsWithGrowth = results.map((item, index) => {
        let growthRate = 0;
        if (index > 0 && results[index - 1].averageLevel > 0) {
          growthRate =
            ((item.averageLevel - results[index - 1].averageLevel) /
              results[index - 1].averageLevel) *
            100;
        }
        return {
          ...item,
          growthRate: parseFloat(growthRate.toFixed(1)),
        };
      });

      return trendsWithGrowth;
    } catch (error) {
      console.error("成長推移データ取得エラー:", error);
      return [];
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
   * 今後の傾向を予測
   */
  async predictFutureTrend(
    joinYear?: number,
    department?: string
  ): Promise<string> {
    try {
      // 成長推移データを取得
      const growthTrend = await this.getGrowthTrend(joinYear, department);

      // 成長率の平均を計算
      const growthRates = growthTrend
        .filter((item: { growthRate: number }) => item.growthRate != 0)
        .map((item: { growthRate: any }) => item.growthRate);
      const averageGrowthRate =
        growthRates.length > 0
          ? growthRates.reduce((acc: any, val: any) => acc + val, 0) /
            growthRates.length
          : 0;

      // スキルレベル分布を取得
      const skillDistribution = await this.getSkillDistribution(
        joinYear,
        department
      );

      // 現在のスキルレベル平均を計算
      const totalTrainees = skillDistribution.reduce(
        (acc, item) => acc + item.count,
        0
      );
      let currentAvgLevel = 0;

      if (totalTrainees > 0) {
        const weightedSum = skillDistribution.reduce((acc, item) => {
          const levelWeight =
            ({ A: 5, B: 4, C: 3, D: 2, E: 1 } as Record<string, number>)[
              item.level
            ] || 0;

          return acc + levelWeight * item.count;
        }, 0);

        currentAvgLevel = weightedSum / totalTrainees;
      }

      // 3ヶ月後のスキルレベルを予測
      const predictedAvgLevel =
        currentAvgLevel * (1 + (averageGrowthRate / 100) * 3);

      // 部署や年度のフィルター文字列を作成
      const filterDesc = [];
      if (joinYear) {
        filterDesc.push(`${joinYear}年度入社の新入社員`);
      } else {
        filterDesc.push(`全年度の新入社員`);
      }

      if (department) {
        filterDesc.push(`${department}部署に所属する社員`);
      } else {
        filterDesc.push(`全部署の社員`);
      }

      // トレンド文字列を生成
      let trendText = `【分析対象】${filterDesc.join("かつ")}\n\n`;

      // 現在の状況説明
      trendText += `【現在の状況】\n`;
      trendText += `・新入社員数: ${totalTrainees}名\n`;
      trendText += `・現在の平均スキルレベル: ${currentAvgLevel.toFixed(
        2
      )}（5段階評価）\n`;
      trendText += `・過去6ヶ月の平均成長率: ${averageGrowthRate.toFixed(
        2
      )}%/月\n\n`;

      // 予測結果
      trendText += `【3ヶ月後の予測】\n`;
      trendText += `・予測平均スキルレベル: ${predictedAvgLevel.toFixed(
        2
      )}（5段階評価）\n`;

      // スキルレベルの解釈
      const interpretLevel = (level: number): string => {
        if (level >= 4.5) return "A（熟練）";
        if (level >= 3.5) return "B（上級）";
        if (level >= 2.5) return "C（中級）";
        if (level >= 1.5) return "D（初級）";
        return "E（入門）";
      };

      trendText += `・予測スキルレベル評価: ${interpretLevel(
        predictedAvgLevel
      )}\n\n`;

      // 傾向の解釈と提案
      trendText += `【傾向分析】\n`;

      if (averageGrowthRate > 15) {
        trendText += `・成長率が非常に高く、効果的な学習が行われています。現在の学習プログラムを継続し、さらに発展的な内容を取り入れることを推奨します。\n`;
      } else if (averageGrowthRate > 5) {
        trendText += `・安定した成長が見られます。現在の学習プログラムは効果的ですが、より高度なチャレンジを導入することで成長を加速できる可能性があります。\n`;
      } else if (averageGrowthRate > 0) {
        trendText += `・緩やかな成長が見られますが、改善の余地があります。より実践的な課題や個別指導の強化を検討してください。\n`;
      } else {
        trendText += `・成長が停滞している可能性があります。学習プログラムの見直しや、新たな刺激を与える取り組みを検討してください。\n`;
      }

      // レベル分布に基づく提案
      const highLevelCount = skillDistribution
        .filter((item) => item.level === "A" || item.level === "B")
        .reduce((acc, item) => acc + item.count, 0);

      const lowLevelCount = skillDistribution
        .filter((item) => item.level === "D" || item.level === "E")
        .reduce((acc, item) => acc + item.count, 0);

      if (highLevelCount > lowLevelCount && totalTrainees > 0) {
        const highRatio = (highLevelCount / totalTrainees) * 100;
        trendText += `・上位レベル(A・B)の社員が${highRatio.toFixed(
          1
        )}%を占めており、メンター制度の導入や知識共有の場を設けることで、チーム全体のスキル向上が期待できます。\n`;
      } else if (lowLevelCount > 0 && totalTrainees > 0) {
        const lowRatio = (lowLevelCount / totalTrainees) * 100;
        trendText += `・初級レベル(D・E)の社員が${lowRatio.toFixed(
          1
        )}%を占めています。基礎的な学習コンテンツの拡充や、段階的な課題設定を行うことで、底上げを図ることが重要です。\n`;
      }

      return trendText;
    } catch (error) {
      console.error("傾向予測エラー:", error);
      return "十分なデータがないため、信頼性の高い予測ができません。より多くのデータを収集することで、精度の高い予測が可能になります。";
    }
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
