// backend/src/services/EvaluationService.ts - 修正版
import { AppDataSource } from "../index";
import { Evaluation, SkillLevel } from "../models/Evaluation";
import { User } from "../models/User";
import { CodeSubmission } from "../models/CodeSubmission";
import { EvaluationCriteriaService } from "./EvaluationCriteriaService";

export class EvaluationService {
  private evaluationRepository = AppDataSource.getRepository(Evaluation);
  private userRepository = AppDataSource.getRepository(User);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private criteriaService: EvaluationCriteriaService;

  constructor() {
    // 評価基準サービスのインスタンスを取得
    this.criteriaService = EvaluationCriteriaService.getInstance();
  }

  /**
   * 評価を作成（動的な評価基準に対応）
   */
  async createEvaluation(evaluationData: {
    user_id: number;
    submission_id: number;
    [key: string]: any; // 動的に追加される評価基準スコア
  }): Promise<Evaluation> {
    try {
      // 基本データとスコアデータを分離
      const { user_id, submission_id, ...scores } = evaluationData;

      // スコアのみを抽出（_scoreで終わるキーを持つデータ）
      const scoreData: Record<string, number> = {};
      Object.entries(scores).forEach(([key, value]) => {
        if (key.endsWith("_score") && typeof value === "number") {
          scoreData[key] = value;
        }
      });

      // 総合スコアを計算
      const overallScore = await this.criteriaService.calculateOverallScore(
        scoreData
      );

      // スキルレベルを決定
      const overallLevel = await this.criteriaService.determineLevel(
        overallScore
      );

      // 評価インスタンスを作成
      const evaluation = this.evaluationRepository.create({
        user_id,
        submission_id,
        ...scoreData, // すべてのスコアを含める
        overall_level: overallLevel as SkillLevel, // 計算されたレベル
      });

      // データベースに保存
      return await this.evaluationRepository.save(evaluation);
    } catch (error) {
      console.error("評価作成エラー:", error);
      throw error;
    }
  }

  /**
   * IDで評価を取得
   */
  async getEvaluationById(id: number): Promise<Evaluation | null> {
    return await this.evaluationRepository.findOne({
      where: { id },
      relations: ["user", "submission"],
    });
  }

  /**
   * ユーザーの最新の評価を取得
   */
  async getLatestEvaluationByUserId(
    userId: number
  ): Promise<Evaluation | null> {
    try {
      const evaluation = await this.evaluationRepository.findOne({
        where: { user_id: userId },
        order: { created_at: "DESC" },
      });

      return evaluation;
    } catch (error) {
      console.error(`ユーザーID ${userId} の最新評価取得エラー:`, error);
      return null;
    }
  }

  /**
   * ユーザーの評価履歴を取得
   */
  async getEvaluationHistoryByUserId(userId: number): Promise<Evaluation[]> {
    try {
      const evaluations = await this.evaluationRepository.find({
        where: { user_id: userId },
        order: { created_at: "DESC" },
      });

      return evaluations;
    } catch (error) {
      console.error(`ユーザーID ${userId} の評価履歴取得エラー:`, error);
      return [];
    }
  }

  /**
   * 提出IDで評価を取得
   */
  async getEvaluationBySubmissionId(
    submissionId: number
  ): Promise<Evaluation | null> {
    return await this.evaluationRepository.findOne({
      where: { submission_id: submissionId },
    });
  }

  /**
   * 特定の期間内の評価を取得
   */
  async getEvaluationsInDateRange(
    startDate: Date,
    endDate: Date,
    joinYear?: number,
    department?: string
  ): Promise<Evaluation[]> {
    try {
      const queryBuilder = this.evaluationRepository
        .createQueryBuilder("evaluation")
        .leftJoinAndSelect("evaluation.user", "user")
        .where("evaluation.created_at BETWEEN :startDate AND :endDate", {
          startDate,
          endDate,
        });

      if (joinYear) {
        queryBuilder.andWhere("user.join_year = :joinYear", { joinYear });
      }

      if (department) {
        queryBuilder.andWhere("user.department = :department", { department });
      }

      return await queryBuilder.getMany();
    } catch (error) {
      console.error("期間内の評価取得エラー:", error);
      return [];
    }
  }

  /**
   * ユーザーの評価レベルを集計（動的な評価基準をサポート）
   */
  async getSkillLevelDistribution(
    joinYear?: number,
    department?: string
  ): Promise<any[]> {
    try {
      // 各レベルの最新の評価を持つユーザー数を集計するクエリ
      const queryBuilder = this.evaluationRepository
        .createQueryBuilder("e1")
        .select("e1.overall_level", "level")
        .addSelect("COUNT(DISTINCT e1.user_id)", "count").where(`e1.id IN (
          SELECT MAX(e2.id) 
          FROM evaluations e2 
          WHERE e2.user_id = e1.user_id 
          GROUP BY e2.user_id
        )`);

      // 入社年度でフィルタリング
      if (joinYear) {
        queryBuilder
          .innerJoin("users", "u", "e1.user_id = u.id")
          .andWhere("u.join_year = :joinYear", { joinYear });
      }

      // 部署でフィルタリング
      if (department) {
        if (!joinYear) {
          // joinYearでのフィルタリングがなければinner joinを追加
          queryBuilder.innerJoin("users", "u", "e1.user_id = u.id");
        }
        queryBuilder.andWhere("u.department = :department", { department });
      }

      // グループ化して結果を取得
      queryBuilder.groupBy("e1.overall_level");

      const result = await queryBuilder.getRawMany();

      // すべてのスキルレベルを確保
      const allLevels = ["A", "B", "C", "D", "E"];
      const distribution = allLevels.map((level) => {
        const found = result.find((r) => r.level === level);
        return {
          level,
          count: found ? parseInt(found.count) : 0,
        };
      });

      return distribution;
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
   * 評価を更新（動的な評価基準に対応）
   */
  async updateEvaluation(
    id: number,
    updateData: Partial<Evaluation>
  ): Promise<Evaluation | null> {
    try {
      // 既存の評価を取得
      const existingEvaluation = await this.getEvaluationById(id);
      if (!existingEvaluation) {
        return null;
      }

      // スコアのみを抽出（_scoreで終わるキーを持つデータ）
      const scoreData: Record<string, number> = {};
      Object.entries(updateData).forEach(([key, value]) => {
        if (key.endsWith("_score") && typeof value === "number") {
          scoreData[key] = value;
        }
      });

      // 既存のスコアと統合
      const mergedScores: Record<string, number> = {};

      // 既存の評価からスコアを抽出
      Object.entries(existingEvaluation).forEach(([key, value]) => {
        if (key.endsWith("_score") && typeof value === "number") {
          mergedScores[key] = value;
        }
      });

      // 更新データでスコアを上書き
      Object.assign(mergedScores, scoreData);

      // レベルを再計算（スコアが変更された場合）
      if (Object.keys(scoreData).length > 0) {
        const overallScore = await this.criteriaService.calculateOverallScore(
          mergedScores
        );
        const overallLevel = await this.criteriaService.determineLevel(
          overallScore
        );
        updateData.overall_level = overallLevel as SkillLevel;
      }

      // 評価を更新
      await this.evaluationRepository.update(id, {
        ...updateData,
      });

      return this.getEvaluationById(id);
    } catch (error) {
      console.error(`評価ID ${id} の更新エラー:`, error);
      return null;
    }
  }

  /**
   * 評価を削除
   */
  async deleteEvaluation(id: number): Promise<boolean> {
    const result = await this.evaluationRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /**
   * 評価データからスコアを抽出（レポート生成などで使用）
   */
  async extractScoresFromEvaluation(
    evaluation: Evaluation
  ): Promise<Record<string, number>> {
    const scoreData: Record<string, number> = {};

    // 評価オブジェクトからスコアを抽出
    Object.entries(evaluation).forEach(([key, value]) => {
      if (key.endsWith("_score") && typeof value === "number") {
        scoreData[key] = value;
      }
    });

    return scoreData;
  }

  /**
   * 総合スコアを計算
   */
  async calculateOverallScore(evaluation: Evaluation): Promise<number> {
    const scores = await this.extractScoresFromEvaluation(evaluation);
    return this.criteriaService.calculateOverallScore(scores);
  }

  /**
   * ユーザーの進捗状況を取得（スキルレベルの変化を追跡）
   */
  async getUserProgressData(
    userId: number,
    period: string = "6months"
  ): Promise<any> {
    try {
      // 期間の設定
      const endDate = new Date();
      const startDate = new Date();
      const months = period === "3months" ? 3 : period === "12months" ? 12 : 6;
      startDate.setMonth(startDate.getMonth() - (months - 1));

      // 月ごとにデータを取得
      const monthlyData = [];
      for (let i = 0; i < months; i++) {
        const month = new Date(startDate);
        month.setMonth(month.getMonth() + i);

        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

        // その月の最新の評価を取得
        const evaluation = await this.evaluationRepository.findOne({
          where: {
            user_id: userId,
            created_at: Between(monthStart, monthEnd),
          },
          order: { created_at: "DESC" },
        });

        if (evaluation) {
          const scores = await this.extractScoresFromEvaluation(evaluation);
          const criteriaMapping =
            await this.criteriaService.getCriteriaMapping();

          // スコアをフォーマット
          const formattedScores: Record<string, number> = {};
          Object.entries(scores).forEach(([key, value]) => {
            const displayName =
              criteriaMapping[key] || key.replace("_score", "");
            formattedScores[displayName] = value;
          });

          monthlyData.push({
            month: `${month.getFullYear()}/${month.getMonth() + 1}`,
            evaluation: {
              level: evaluation.overall_level,
              scores: formattedScores,
              overall: await this.calculateOverallScore(evaluation),
            },
          });
        } else {
          // データがない月はnullを設定
          monthlyData.push({
            month: `${month.getFullYear()}/${month.getMonth() + 1}`,
            evaluation: null,
          });
        }
      }

      return monthlyData;
    } catch (error) {
      console.error(`ユーザー進捗データ取得エラー: ${error}`);
      return [];
    }
  }
}

// TypeORMのBetween演算子をインポート
import { Between } from "typeorm";
