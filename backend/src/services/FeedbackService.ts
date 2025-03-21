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
      is_resolved: feedbackData.is_resolved || false,
      reference_url: feedbackData.reference_url,
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

  /**
   * フィードバックの対応状態を更新
   */
  async updateFeedbackStatus(
    id: number,
    isResolved: boolean
  ): Promise<Feedback | null> {
    // フィードバックの存在確認
    const feedback = await this.getFeedbackById(id);
    if (!feedback) {
      throw new Error("フィードバックが見つかりません");
    }

    // 対応状態を更新
    await this.feedbackRepository.update(id, { is_resolved: isResolved });

    // 更新されたフィードバックを返す
    return this.getFeedbackById(id);
  }

  /**
   * 特定の提出のフィードバック解決率を取得
   */
  async getResolutionRate(
    submissionId: number
  ): Promise<{ total: number; resolved: number; rate: number }> {
    const feedbacks = await this.getFeedbacksBySubmissionId(submissionId);
    const total = feedbacks.length;
    const resolved = feedbacks.filter(
      (feedback) => feedback.is_resolved
    ).length;
    const rate = total > 0 ? (resolved / total) * 100 : 0;

    return {
      total,
      resolved,
      rate: Math.round(rate),
    };
  }
}
