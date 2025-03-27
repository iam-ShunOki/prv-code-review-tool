// backend/src/services/FeedbackService.ts
import { AppDataSource } from "../index";
import {
  Feedback,
  FeedbackCategory,
  FeedbackPriority,
} from "../models/Feedback";
import { In, MoreThan } from "typeorm";

export class FeedbackService {
  private feedbackRepository = AppDataSource.getRepository(Feedback);

  /**
   * 新規フィードバック作成
   */
  async createFeedback(feedbackData: {
    submission_id: number;
    problem_point: string;
    suggestion: string;
    priority: FeedbackPriority;
    reference_url?: string;
    code_snippet?: string;
    category?: FeedbackCategory;
  }): Promise<Feedback> {
    console.log(
      `提出 #${feedbackData.submission_id} に対する新規フィードバックを作成します`
    );

    const feedback = this.feedbackRepository.create({
      submission_id: feedbackData.submission_id,
      problem_point: feedbackData.problem_point,
      suggestion: feedbackData.suggestion,
      priority: feedbackData.priority,
      reference_url: feedbackData.reference_url,
      code_snippet: feedbackData.code_snippet,
      category: feedbackData.category,
      is_resolved: false,
      is_checked: false,
    });

    const savedFeedback = await this.feedbackRepository.save(feedback);
    console.log(`フィードバック #${savedFeedback.id} が正常に作成されました`);

    return savedFeedback;
  }

  /**
   * 特定の提出に対するフィードバック一覧を取得
   */
  async getFeedbacksBySubmissionId(submissionId: number): Promise<Feedback[]> {
    console.log(`提出 #${submissionId} に対するフィードバック一覧を取得します`);

    const feedbacks = await this.feedbackRepository.find({
      where: { submission_id: submissionId },
      order: { priority: "ASC", id: "ASC" },
    });

    console.log(
      `提出 #${submissionId} に対するフィードバックが ${feedbacks.length} 件見つかりました`
    );
    return feedbacks;
  }

  /**
   * フィードバックの詳細を取得
   */
  async getFeedbackById(id: number): Promise<Feedback | null> {
    console.log(`フィードバック #${id} の詳細を取得します`);

    const feedback = await this.feedbackRepository.findOne({
      where: { id },
    });

    if (feedback) {
      console.log(`フィードバック #${id} が見つかりました`);
    } else {
      console.log(`フィードバック #${id} は見つかりませんでした`);
    }

    return feedback;
  }

  /**
   * フィードバックの解決状態を更新
   */
  async updateFeedbackStatus(
    id: number,
    isResolved: boolean
  ): Promise<Feedback | null> {
    console.log(
      `フィードバック #${id} の解決状態を ${
        isResolved ? "解決済み" : "未解決"
      } に更新します`
    );

    await this.feedbackRepository.update(id, { is_resolved: isResolved });
    return this.getFeedbackById(id);
  }

  /**
   * フィードバックのカテゴリを更新
   */
  async updateFeedbackCategory(
    id: number,
    category: FeedbackCategory
  ): Promise<Feedback | null> {
    console.log(`フィードバック #${id} のカテゴリを ${category} に更新します`);

    await this.feedbackRepository.update(id, { category });
    return this.getFeedbackById(id);
  }

  /**
   * フィードバックの解決率を計算
   */
  async getResolutionRate(submissionId: number): Promise<{
    total: number;
    resolved: number;
    rate: number;
  }> {
    console.log(`提出 #${submissionId} のフィードバック解決率を計算します`);

    const feedbacks = await this.getFeedbacksBySubmissionId(submissionId);
    const total = feedbacks.length;
    const resolved = feedbacks.filter(
      (feedback) => feedback.is_resolved
    ).length;
    const rate = total > 0 ? (resolved / total) * 100 : 0;

    console.log(`解決率: ${rate.toFixed(2)}% (${resolved}/${total})`);
    return { total, resolved, rate };
  }

  /**
   * チェックリスト関連の新機能
   */

  /**
   * フィードバックのチェック状態を更新
   */
  async updateFeedbackCheckStatus(
    id: number,
    isChecked: boolean,
    userId: number
  ): Promise<Feedback | null> {
    console.log(
      `フィードバック #${id} のチェック状態を ${
        isChecked ? "チェック済み" : "未チェック"
      } に更新します (ユーザー #${userId})`
    );

    await this.feedbackRepository.update(id, {
      is_checked: isChecked,
      checked_at: isChecked ? new Date() : undefined,
      checked_by: isChecked ? userId : undefined,
    });

    return this.getFeedbackById(id);
  }

  /**
   * 複数のフィードバックのチェック状態を一括更新
   */
  async bulkUpdateCheckStatus(
    ids: number[],
    isChecked: boolean,
    userId: number
  ): Promise<boolean> {
    if (ids.length === 0) {
      console.log("更新対象のフィードバックIDが指定されていません");
      return false;
    }

    console.log(
      `${ids.length}件のフィードバックのチェック状態を一括更新します`
    );

    try {
      await this.feedbackRepository.update(
        { id: In(ids) },
        {
          is_checked: isChecked,
          checked_at: isChecked ? new Date() : undefined,
          checked_by: isChecked ? userId : undefined,
        }
      );
      console.log("一括更新が正常に完了しました");
      return true;
    } catch (error) {
      console.error("一括更新中にエラーが発生しました:", error);
      return false;
    }
  }

  /**
   * チェック完了率を計算
   */
  async getChecklistRate(submissionId: number): Promise<{
    total: number;
    checked: number;
    rate: number;
  }> {
    console.log(`提出 #${submissionId} のチェックリスト完了率を計算します`);

    const feedbacks = await this.getFeedbacksBySubmissionId(submissionId);
    const total = feedbacks.length;
    const checked = feedbacks.filter((feedback) => feedback.is_checked).length;
    const rate = total > 0 ? (checked / total) * 100 : 0;

    console.log(`チェック完了率: ${rate.toFixed(2)}% (${checked}/${total})`);
    return { total, checked, rate };
  }

  /**
   * 全てのフィードバックがチェック完了しているか確認
   */
  async isAllFeedbacksChecked(submissionId: number): Promise<boolean> {
    console.log(
      `提出 #${submissionId} の全フィードバックがチェック完了しているか確認します`
    );

    const { total, checked } = await this.getChecklistRate(submissionId);
    const isAllChecked = total > 0 && total === checked;

    console.log(
      `チェック完了状況: ${
        isAllChecked ? "全て完了" : "未完了あり"
      } (${checked}/${total})`
    );
    return isAllChecked;
  }

  /**
   * フィードバックのカテゴリ別集計を取得
   */
  async getFeedbackCategorySummary(submissionId: number): Promise<
    {
      category: string;
      count: number;
      checked: number;
      rate: number;
    }[]
  > {
    console.log(
      `提出 #${submissionId} のフィードバックをカテゴリ別に集計します`
    );

    const feedbacks = await this.getFeedbacksBySubmissionId(submissionId);

    // カテゴリ別に集計
    const categoryCounts: Record<string, { count: number; checked: number }> =
      {};

    // カテゴリなしのフィードバックもカウント
    feedbacks.forEach((feedback) => {
      const category = feedback.category || "uncategorized";

      if (!categoryCounts[category]) {
        categoryCounts[category] = { count: 0, checked: 0 };
      }

      categoryCounts[category].count++;

      if (feedback.is_checked) {
        categoryCounts[category].checked++;
      }
    });

    // 結果を配列に変換
    const result = Object.entries(categoryCounts).map(([category, data]) => {
      const rate = data.count > 0 ? (data.checked / data.count) * 100 : 0;
      return {
        category,
        count: data.count,
        checked: data.checked,
        rate,
      };
    });

    console.log(`カテゴリ別集計が完了しました: ${result.length}カテゴリ`);
    return result;
  }

  /**
   * 最後にチェックされたフィードバックを取得
   */
  async getLastCheckedFeedback(submissionId: number): Promise<Feedback | null> {
    console.log(
      `提出 #${submissionId} の最後にチェックされたフィードバックを取得します`
    );

    const feedback = await this.feedbackRepository.findOne({
      where: {
        submission_id: submissionId,
        is_checked: true,
        checked_at: MoreThan(new Date(0)), // 日時が設定されているもの
      },
      order: { checked_at: "DESC" },
      relations: ["checker"], // チェックしたユーザー情報も取得
    });

    if (feedback) {
      console.log(
        `最後にチェックされたフィードバック #${feedback.id} が見つかりました (${feedback.checked_at})`
      );
    } else {
      console.log("チェック済みのフィードバックは見つかりませんでした");
    }

    return feedback;
  }
}
