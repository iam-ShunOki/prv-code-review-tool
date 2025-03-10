// backend/src/services/FeedbackService.ts
import { AppDataSource } from "../index";
import { Feedback, FeedbackPriority } from "../models/Feedback";

export class FeedbackService {
  private feedbackRepository = AppDataSource.getRepository(Feedback);

  /**
   * 新規フィードバック作成
   */
  async createFeedback(feedbackData: Partial<Feedback>): Promise<Feedback> {
    // feedbackDataがすべての必須フィールドを持っていることを確認
    if (
      !feedbackData.submission_id ||
      !feedbackData.problem_point ||
      !feedbackData.suggestion
    ) {
      throw new Error("必須フィールドが不足しています");
    }

    // TypeScript型チェックエラーを回避するためEntityを手動で構築
    const entity = {
      submission_id: feedbackData.submission_id,
      problem_point: feedbackData.problem_point,
      suggestion: feedbackData.suggestion,
      priority: feedbackData.priority || FeedbackPriority.MEDIUM,
      line_number: feedbackData.line_number,
    };

    // 直接リポジトリに渡して保存
    return this.feedbackRepository.save(entity as Feedback);
  }

  /**
   * 特定のコード提出に対するフィードバック一覧を取得
   */
  async getFeedbacksBySubmissionId(submissionId: number): Promise<Feedback[]> {
    return this.feedbackRepository.find({
      where: { submission_id: submissionId },
      order: {
        priority: "ASC", // HIGHが先に来るようにする
        id: "ASC",
      },
    });
  }

  /**
   * 特定のフィードバックを取得
   */
  async getFeedbackById(id: number): Promise<Feedback | null> {
    return this.feedbackRepository.findOne({
      where: { id },
    });
  }
}
