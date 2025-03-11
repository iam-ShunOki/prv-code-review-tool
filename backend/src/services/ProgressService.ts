// backend/src/services/ProgressService.ts
import { AppDataSource } from "../index";
import { User } from "../models/User";
import { Review } from "../models/Review";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { Evaluation, SkillLevel } from "../models/Evaluation";

export class ProgressService {
  private userRepository = AppDataSource.getRepository(User);
  private reviewRepository = AppDataSource.getRepository(Review);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private feedbackRepository = AppDataSource.getRepository(Feedback);
  private evaluationRepository = AppDataSource.getRepository(Evaluation);

  /**
   * ユーザーの進捗概要を取得
   */
  async getUserProgressSummary(userId: number): Promise<any> {
    try {
      // ユーザーが存在するか確認
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("ユーザーが見つかりません");
      }

      // レビュー数
      const reviewCount = await this.reviewRepository.count({
        where: { user_id: userId },
      });

      // 提出数
      const submissionCount = await this.submissionRepository.count({
        where: { review: { user_id: userId } },
      });

      // 最新の評価を取得
      const latestEvaluation = await this.evaluationRepository.findOne({
        where: { user_id: userId },
        order: { created_at: "DESC" },
      });

      // 評価がまだない場合はデフォルト値を設定
      const currentLevel = latestEvaluation
        ? latestEvaluation.overall_level
        : "C";
      const skillScores = latestEvaluation
        ? {
            codeQuality: latestEvaluation.code_quality_score,
            readability: latestEvaluation.readability_score,
            efficiency: latestEvaluation.efficiency_score,
            bestPractices: latestEvaluation.best_practices_score,
          }
        : {
            codeQuality: 60,
            readability: 60,
            efficiency: 60,
            bestPractices: 60,
          };

      // 実際のデータがまだ少ない場合は、モックデータも使用
      return {
        userId,
        reviewCount,
        submissionCount,
        currentLevel,
        skillScores,
        // 実データが揃うまでモックデータを使用
        levelHistory: await this.getMockLevelHistory(userId),
        feedbackSummary: await this.getMockFeedbackSummary(userId),
      };
    } catch (error) {
      console.error("進捗概要取得エラー:", error);
      throw error;
    }
  }

  /**
   * ユーザーのレビュー履歴を取得
   */
  async getUserReviewHistory(userId: number): Promise<any[]> {
    try {
      // レビュー履歴を取得（最新順）
      const reviews = await this.reviewRepository.find({
        where: { user_id: userId },
        order: { created_at: "DESC" },
        relations: ["submissions"],
      });

      const enrichedReviews = [];

      for (const review of reviews) {
        // 最新の提出を取得
        const latestSubmission =
          review.submissions.length > 0
            ? review.submissions.reduce((latest, current) =>
                current.version > latest.version ? current : latest
              )
            : null;

        // フィードバック数を取得
        let feedbackCount = 0;
        if (latestSubmission) {
          feedbackCount = await this.feedbackRepository.count({
            where: { submission_id: latestSubmission.id },
          });
        }

        // 最新の評価を取得
        let evaluation = null;
        if (latestSubmission) {
          evaluation = await this.evaluationRepository.findOne({
            where: { submission_id: latestSubmission.id },
          });
        }

        enrichedReviews.push({
          id: review.id,
          title: review.title,
          description: review.description,
          status: review.status,
          created_at: review.created_at,
          updated_at: review.updated_at,
          submissionCount: review.submissions.length,
          latestVersion: latestSubmission ? latestSubmission.version : 0,
          feedbackCount,
          level: evaluation ? evaluation.overall_level : null,
        });
      }

      return enrichedReviews;
    } catch (error) {
      console.error("レビュー履歴取得エラー:", error);
      // データがない場合はモックデータを返す
      return this.getMockReviewHistory();
    }
  }

  /**
   * ユーザーの成長推移データを取得
   */
  async getUserGrowthData(
    userId: number,
    period: string = "6months"
  ): Promise<any> {
    try {
      // 期間に基づいて日付範囲を計算
      const endDate = new Date();
      const startDate = new Date();

      if (period === "12months") {
        startDate.setMonth(startDate.getMonth() - 12);
      } else if (period === "3months") {
        startDate.setMonth(startDate.getMonth() - 3);
      } else {
        // デフォルトは6ヶ月
        startDate.setMonth(startDate.getMonth() - 6);
      }

      // 期間内の評価を取得
      const evaluations = await this.evaluationRepository.find({
        where: {
          user_id: userId,
          created_at: { $gte: startDate, $lte: endDate } as any,
        },
        order: { created_at: "ASC" },
      });

      if (evaluations.length === 0) {
        // 評価データがない場合はモックデータを返す
        return this.getMockGrowthData(period);
      }

      // 月ごとに集計
      const monthlyData: Record<
        string,
        {
          month: string;
          codeQuality: number[];
          readability: number[];
          efficiency: number[];
          bestPractices: number[];
          overall: number[];
        }
      > = {};

      evaluations.forEach((evaluation) => {
        const date = new Date(evaluation.created_at);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            month: date.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "short",
            }),
            codeQuality: [],
            readability: [],
            efficiency: [],
            bestPractices: [],
            overall: [],
          };
        }

        monthlyData[monthKey].codeQuality.push(evaluation.code_quality_score);
        monthlyData[monthKey].readability.push(evaluation.readability_score);
        monthlyData[monthKey].efficiency.push(evaluation.efficiency_score);
        monthlyData[monthKey].bestPractices.push(
          evaluation.best_practices_score
        );

        // スキルレベルを数値に変換
        const levelValue = this.levelToValue(evaluation.overall_level);
        monthlyData[monthKey].overall.push(levelValue);
      });

      // 月ごとの平均値を計算
      const result = Object.keys(monthlyData)
        .sort()
        .map((key) => {
          const data = monthlyData[key];
          return {
            month: data.month,
            codeQuality: this.average(data.codeQuality),
            readability: this.average(data.readability),
            efficiency: this.average(data.efficiency),
            bestPractices: this.average(data.bestPractices),
            overall: this.average(data.overall),
          };
        });

      return result;
    } catch (error) {
      console.error("成長推移データ取得エラー:", error);
      // エラー時はモックデータを返す
      return this.getMockGrowthData(period);
    }
  }

  /**
   * ユーザーのフィードバック統計を取得
   */
  async getUserFeedbackStats(userId: number): Promise<any> {
    try {
      // ユーザーの提出に関連するすべてのフィードバックを取得
      const submissions = await this.submissionRepository.find({
        where: { review: { user_id: userId } },
      });

      if (submissions.length === 0) {
        return this.getMockFeedbackSummary(userId);
      }

      const submissionIds = submissions.map((s) => s.id);

      // フィードバックを取得
      const feedbacks = await this.feedbackRepository.find({
        where: { submission_id: { $in: submissionIds } as any },
      });

      // 優先度別の集計
      const priorityCounts = {
        high: 0,
        medium: 0,
        low: 0,
      };

      feedbacks.forEach((fb) => {
        priorityCounts[fb.priority]++;
      });

      // フィードバックタイプの分析（実際はAIによる分類が必要）
      // ここではシンプルな例として問題点から抽出
      const typePatterns = {
        コードスタイル: [
          "コードスタイル",
          "フォーマット",
          "インデント",
          "スペース",
        ],
        命名規則: ["命名", "変数名", "関数名", "クラス名"],
        パフォーマンス: ["パフォーマンス", "効率", "最適化", "遅い"],
        エラーハンドリング: ["エラー", "例外", "ハンドリング", "try", "catch"],
        セキュリティ: ["セキュリティ", "脆弱性", "インジェクション", "XSS"],
        ドキュメント: ["ドキュメント", "コメント", "説明"],
        テスト: ["テスト", "ユニットテスト", "カバレッジ"],
        その他: [],
      };

      const typeCounts = Object.keys(typePatterns).reduce((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {} as Record<string, number>);

      // 単純な文字列マッチングでタイプを推定（実際はもっと高度な分類が必要）
      feedbacks.forEach((fb) => {
        let matched = false;
        for (const [type, patterns] of Object.entries(typePatterns)) {
          if (type === "その他") continue;

          for (const pattern of patterns) {
            if (
              fb.problem_point.toLowerCase().includes(pattern.toLowerCase())
            ) {
              typeCounts[type]++;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        if (!matched) {
          typeCounts["その他"]++;
        }
      });

      // タイプ分布を配列形式に変換
      const typeDistribution = Object.entries(typeCounts)
        .map(([type, count]) => ({
          type,
          count: count as number,
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count);

      return {
        totalFeedbacks: feedbacks.length,
        priorityDistribution: [
          { priority: "high", count: priorityCounts.high },
          { priority: "medium", count: priorityCounts.medium },
          { priority: "low", count: priorityCounts.low },
        ],
        typeDistribution,
        improvement: this.getMockImprovementData(), // 改善データはモック
      };
    } catch (error) {
      console.error("フィードバック統計取得エラー:", error);
      return this.getMockFeedbackSummary(userId);
    }
  }

  // ヘルパーメソッド: レベルを数値に変換
  private levelToValue(level: SkillLevel): number {
    const levelMap = {
      A: 100,
      B: 80,
      C: 60,
      D: 40,
      E: 20,
    };
    return levelMap[level] || 60;
  }

  // ヘルパーメソッド: 配列の平均値を計算
  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((sum, val) => sum + val, 0) / arr.length);
  }

  /**
   * モックデータ: レベル履歴
   */
  private async getMockLevelHistory(userId: number): Promise<any[]> {
    // 実際のユーザーIDを使って一貫したモックデータを生成
    const seed = userId;
    const startLevel = seed % 5 === 0 ? "D" : seed % 3 === 0 ? "C" : "E";

    const history = [];
    let currentLevel = startLevel;

    // 過去5回分のレベル変化をシミュレート
    for (let i = 0; i < 5; i++) {
      if (currentLevel === "E" && Math.random() > 0.3) {
        currentLevel = "D";
      } else if (currentLevel === "D" && Math.random() > 0.4) {
        currentLevel = "C";
      } else if (currentLevel === "C" && Math.random() > 0.6) {
        currentLevel = "B";
      } else if (currentLevel === "B" && Math.random() > 0.8) {
        currentLevel = "A";
      }

      const date = new Date();
      date.setMonth(date.getMonth() - (4 - i));

      history.push({
        level: currentLevel,
        date: date.toISOString(),
        reviewId: 1000 + i,
      });
    }

    return history;
  }

  /**
   * モックデータ: レビュー履歴
   */
  private getMockReviewHistory(): any[] {
    return [
      {
        id: 1005,
        title: "ユーザー認証機能の実装",
        description: "サインアップとログイン機能の実装",
        status: "completed",
        created_at: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000
        ).toISOString(),
        submissionCount: 3,
        latestVersion: 3,
        feedbackCount: 7,
        level: "C",
      },
      {
        id: 1004,
        title: "フォームバリデーション",
        description: "入力フォームのバリデーション実装",
        status: "completed",
        created_at: new Date(
          Date.now() - 15 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date(
          Date.now() - 12 * 24 * 60 * 60 * 1000
        ).toISOString(),
        submissionCount: 2,
        latestVersion: 2,
        feedbackCount: 5,
        level: "D",
      },
      {
        id: 1003,
        title: "データ一覧表示機能",
        description: "ページネーション付きデータ一覧の実装",
        status: "completed",
        created_at: new Date(
          Date.now() - 25 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date(
          Date.now() - 20 * 24 * 60 * 60 * 1000
        ).toISOString(),
        submissionCount: 2,
        latestVersion: 2,
        feedbackCount: 4,
        level: "D",
      },
      {
        id: 1002,
        title: "CSVデータのインポート機能",
        description: "CSVファイルからデータをインポートする機能",
        status: "completed",
        created_at: new Date(
          Date.now() - 35 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        submissionCount: 3,
        latestVersion: 3,
        feedbackCount: 8,
        level: "E",
      },
      {
        id: 1001,
        title: "Hello World API",
        description: "最初のAPI実装",
        status: "completed",
        created_at: new Date(
          Date.now() - 45 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date(
          Date.now() - 40 * 24 * 60 * 60 * 1000
        ).toISOString(),
        submissionCount: 1,
        latestVersion: 1,
        feedbackCount: 3,
        level: "E",
      },
    ];
  }

  /**
   * モックデータ: 成長推移
   */
  private getMockGrowthData(period: string): any[] {
    const result = [];
    const monthCount =
      period === "12months" ? 12 : period === "3months" ? 3 : 6;

    // 開始値を設定
    let codeQuality = 45;
    let readability = 40;
    let efficiency = 30;
    let bestPractices = 35;
    let overall = 30;

    // 現在日付から逆算して月ごとのデータを生成
    for (let i = 0; i < monthCount; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - (monthCount - 1 - i));

      // 徐々に成長させる
      codeQuality += Math.floor(Math.random() * 5) + 1;
      readability += Math.floor(Math.random() * 4) + 1;
      efficiency += Math.floor(Math.random() * 6) + 1;
      bestPractices += Math.floor(Math.random() * 4) + 2;
      overall += Math.floor(Math.random() * 4) + 2;

      // 値が100を超えないようにする
      codeQuality = Math.min(codeQuality, 95);
      readability = Math.min(readability, 95);
      efficiency = Math.min(efficiency, 95);
      bestPractices = Math.min(bestPractices, 95);
      overall = Math.min(overall, 95);

      result.push({
        month: date.toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "short",
        }),
        codeQuality,
        readability,
        efficiency,
        bestPractices,
        overall,
      });
    }

    return result;
  }

  /**
   * モックデータ: フィードバック概要
   */
  private async getMockFeedbackSummary(userId: number): Promise<any> {
    // ユーザーIDを使って一貫したデータを生成
    const seed = userId;
    const totalFeedbacks = 30 + (seed % 20);
    const resolvedFeedbacks = Math.floor(totalFeedbacks * 0.7);

    return {
      totalFeedbacks,
      priorityDistribution: [
        { priority: "high", count: Math.floor(totalFeedbacks * 0.2) },
        { priority: "medium", count: Math.floor(totalFeedbacks * 0.5) },
        {
          priority: "low",
          count:
            totalFeedbacks -
            Math.floor(totalFeedbacks * 0.2) -
            Math.floor(totalFeedbacks * 0.5),
        },
      ],
      typeDistribution: [
        { type: "コードスタイル", count: Math.floor(totalFeedbacks * 0.25) },
        { type: "命名規則", count: Math.floor(totalFeedbacks * 0.15) },
        { type: "パフォーマンス", count: Math.floor(totalFeedbacks * 0.15) },
        { type: "エラーハンドリング", count: Math.floor(totalFeedbacks * 0.1) },
        { type: "セキュリティ", count: Math.floor(totalFeedbacks * 0.1) },
        { type: "ドキュメント", count: Math.floor(totalFeedbacks * 0.1) },
        { type: "テスト", count: Math.floor(totalFeedbacks * 0.1) },
        {
          type: "その他",
          count: totalFeedbacks - Math.floor(totalFeedbacks * 0.95),
        },
      ],
      improvement: this.getMockImprovementData(),
    };
  }

  /**
   * モックデータ: 改善状況
   */
  private getMockImprovementData(): any {
    return {
      resolvedRate: 75,
      improvementByType: [
        { type: "コードスタイル", initial: 10, current: 85 },
        { type: "命名規則", initial: 20, current: 80 },
        { type: "パフォーマンス", initial: 15, current: 65 },
        { type: "エラーハンドリング", initial: 10, current: 70 },
        { type: "セキュリティ", initial: 5, current: 60 },
      ],
    };
  }
}
