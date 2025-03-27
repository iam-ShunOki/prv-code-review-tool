// backend/src/repositories/FeedbackRepository.ts
import { AppDataSource } from "../index";
import { Feedback } from "../models/Feedback";
import { Repository } from "typeorm";

// FeedbackRepositoryクラスはFeedbackエンティティのリポジトリを表します
export class FeedbackRepository extends Repository<Feedback> {
  constructor() {
    super(Feedback, AppDataSource.createEntityManager());
  }

  // TypeORMが2.x系では使用可能なカスタムリポジトリ定義だが、
  // 現在のバージョンではAppDataSourceからのリポジトリ取得を推奨

  // カスタムメソッドを追加できます
  async findBySubmissionIdAndCategory(
    submissionId: number,
    category: string
  ): Promise<Feedback[]> {
    return this.find({
      where: {
        submission_id: submissionId,
        category: category as any, // FeedbackCategoryタイプに変換
      },
      order: {
        priority: "ASC",
        id: "ASC",
      },
    });
  }

  async getChecklistStats(submissionId: number): Promise<{
    total: number;
    checked: number;
    unchecked: number;
    rate: number;
  }> {
    const feedbacks = await this.find({
      where: { submission_id: submissionId },
    });

    const total = feedbacks.length;
    const checked = feedbacks.filter((f) => f.is_checked).length;
    const unchecked = total - checked;
    const rate = total > 0 ? (checked / total) * 100 : 0;

    return {
      total,
      checked,
      unchecked,
      rate,
    };
  }
}

// 実際に使用する際は以下のようにリポジトリを取得します
// const feedbackRepository = AppDataSource.getRepository(Feedback);
