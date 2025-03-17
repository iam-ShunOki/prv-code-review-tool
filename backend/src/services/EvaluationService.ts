// backend/src/services/EvaluationService.ts
import { AppDataSource } from "../index";
import { Evaluation, SkillLevel } from "../models/Evaluation";
import { User } from "../models/User";
import { CodeSubmission } from "../models/CodeSubmission";

export class EvaluationService {
  private evaluationRepository = AppDataSource.getRepository(Evaluation);
  private userRepository = AppDataSource.getRepository(User);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);

  /**
   * 評価を作成
   */
  async createEvaluation(evaluationData: {
    user_id: number;
    submission_id: number;
    code_quality_score: number;
    readability_score: number;
    efficiency_score: number;
    best_practices_score: number;
    overall_level: SkillLevel;
  }): Promise<Evaluation> {
    // 評価インスタンスを作成
    const evaluation = this.evaluationRepository.create(evaluationData);

    // データベースに保存
    return await this.evaluationRepository.save(evaluation);
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
   * ユーザーの評価レベルを集計
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
   * 評価を更新
   */
  async updateEvaluation(
    id: number,
    updateData: Partial<Evaluation>
  ): Promise<Evaluation | null> {
    await this.evaluationRepository.update(id, updateData);
    return this.getEvaluationById(id);
  }

  /**
   * 評価を削除
   */
  async deleteEvaluation(id: number): Promise<boolean> {
    const result = await this.evaluationRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
