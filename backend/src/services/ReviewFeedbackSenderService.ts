// backend/src/services/ReviewFeedbackSenderService.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { Feedback } from "../models/Feedback";
import { BacklogService } from "./BacklogService";
import { Not, IsNull } from "typeorm";
import { RepositoryWhitelistService } from "./RepositoryWhitelistService";

export class ReviewFeedbackSenderService {
  private reviewRepository = AppDataSource.getRepository(Review);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private feedbackRepository = AppDataSource.getRepository(Feedback);
  private backlogService: BacklogService;
  private repositoryWhitelistService: RepositoryWhitelistService;

  constructor() {
    this.backlogService = new BacklogService();
    this.repositoryWhitelistService = RepositoryWhitelistService.getInstance();
  }

  /**
   * Backlogのプルリクエストにレビュー結果を返却
   * @param reviewId レビューID
   * @param forceReply ホワイトリスト設定を無視して強制的に返信するかどうか
   */
  async sendReviewFeedbackToPullRequest(
    reviewId: number,
    forceReply: boolean = false
  ): Promise<boolean> {
    try {
      // レビューを取得
      const review = await this.reviewRepository.findOne({
        where: { id: reviewId },
      });

      if (
        !review ||
        !review.backlog_pr_id ||
        !review.backlog_project ||
        !review.backlog_repository
      ) {
        console.log(
          `Review #${reviewId} is not associated with a Backlog pull request`
        );
        return false;
      }

      // ホワイトリストチェック（強制返信が指定されていない場合のみ）
      if (!forceReply) {
        const isAllowed =
          await this.repositoryWhitelistService.isAutoReplyAllowed(
            review.backlog_project,
            review.backlog_repository
          );

        if (!isAllowed) {
          console.log(
            `Auto-reply is not allowed for repository ${review.backlog_project}/${review.backlog_repository}`
          );
          return false;
        }
      }

      // 最新のコード提出を取得
      const submissions = await this.submissionRepository.find({
        where: { review_id: reviewId },
        order: { version: "DESC" },
      });

      if (!submissions || submissions.length === 0) {
        console.log(`No submissions found for review #${reviewId}`);
        return false;
      }

      const latestSubmission = submissions[0];

      // フィードバックを取得
      const feedbacks = await this.feedbackRepository.find({
        where: { submission_id: latestSubmission.id },
        order: { priority: "ASC", id: "ASC" },
      });

      // フィードバックをマークダウン形式に整形
      const formattedFeedback = this.formatFeedbacksAsMarkdown(feedbacks);

      // Backlogにコメントを追加
      await this.backlogService.addPullRequestComment(
        review.backlog_project,
        review.backlog_repository,
        review.backlog_pr_id,
        formattedFeedback
      );

      console.log(
        `Sent review feedback to Backlog PR: ${review.backlog_project}/${review.backlog_repository}#${review.backlog_pr_id}`
      );

      // レビューのステータスを完了に更新
      await this.reviewRepository.update(review.id, {
        status: ReviewStatus.COMPLETED,
      });

      return true;
    } catch (error) {
      console.error(
        `Error sending review feedback to Backlog PR for review #${reviewId}:`,
        error
      );
      return false;
    }
  }

  /**
   * レビュー完了後に自動的にBacklogにフィードバックを送信
   */
  async sendPendingReviewFeedbacks(): Promise<{
    success: number;
    failed: number;
    skipped: number;
  }> {
    try {
      // Backlog PRに関連付けられているレビューを検索
      const reviews = await this.reviewRepository.find({
        where: {
          backlog_pr_id: Not(IsNull()),
          status: ReviewStatus.IN_PROGRESS,
        },
      });

      let success = 0;
      let failed = 0;
      let skipped = 0;

      for (const review of reviews) {
        // 最新の提出を取得
        const latestSubmission = await this.submissionRepository.findOne({
          where: { review_id: review.id },
          order: { version: "DESC" },
        });

        // レビューが完了しているか確認
        if (latestSubmission?.status === SubmissionStatus.REVIEWED) {
          // リポジトリが自動返信を許可しているか確認
          if (!review.backlog_project || !review.backlog_repository) {
            skipped++;
            continue;
          }

          const isAllowed =
            await this.repositoryWhitelistService.isAutoReplyAllowed(
              review.backlog_project,
              review.backlog_repository
            );

          if (!isAllowed) {
            console.log(
              `Skipping auto-reply for repository ${review.backlog_project}/${review.backlog_repository}`
            );
            skipped++;
            continue;
          }

          // フィードバックを送信
          const result = await this.sendReviewFeedbackToPullRequest(review.id);
          if (result) {
            success++;
          } else {
            failed++;
          }
        }
      }

      return { success, failed, skipped };
    } catch (error) {
      console.error("Error sending pending review feedbacks:", error);
      return { success: 0, failed: 0, skipped: 0 };
    }
  }

  /**
   * フィードバックをBacklogコメント用にマークダウン形式に整形
   */
  private formatFeedbacksAsMarkdown(feedbacks: Feedback[]): string {
    if (!feedbacks || feedbacks.length === 0) {
      return "レビュー対象のコードに問題は見つかりませんでした。素晴らしいコードです！";
    }

    let markdown = "## AIコードレビュー結果\n\n";

    // 優先度ごとにフィードバックを分類
    const highPriority = feedbacks.filter((f) => f.priority === "high");
    const mediumPriority = feedbacks.filter((f) => f.priority === "medium");
    const lowPriority = feedbacks.filter((f) => f.priority === "low");

    // サマリーセクション
    markdown += "### サマリー\n\n";
    markdown += `- 高優先度の問題: ${highPriority.length}件\n`;
    markdown += `- 中優先度の問題: ${mediumPriority.length}件\n`;
    markdown += `- 低優先度の問題: ${lowPriority.length}件\n`;
    markdown += `- 合計: ${feedbacks.length}件\n\n`;

    // 高優先度の問題
    if (highPriority.length > 0) {
      markdown += "### 🔴 高優先度の問題\n\n";
      highPriority.forEach((feedback, index) => {
        markdown += this.formatSingleFeedback(feedback, index + 1);
      });
    }

    // 中優先度の問題
    if (mediumPriority.length > 0) {
      markdown += "### 🟠 中優先度の問題\n\n";
      mediumPriority.forEach((feedback, index) => {
        markdown += this.formatSingleFeedback(feedback, index + 1);
      });
    }

    // 低優先度の問題
    if (lowPriority.length > 0) {
      markdown += "### 🟢 低優先度の問題\n\n";
      lowPriority.forEach((feedback, index) => {
        markdown += this.formatSingleFeedback(feedback, index + 1);
      });
    }

    // フッター
    markdown += "\n---\n";
    markdown +=
      "このレビューはAIによって自動生成されました。質問や疑問点があれば、コメントしてください。";

    return markdown;
  }

  /**
   * 単一のフィードバックをマークダウン形式で整形
   */
  private formatSingleFeedback(feedback: Feedback, index: number): string {
    let result = `#### ${index}. ${feedback.problem_point}\n\n`;

    if (feedback.line_number) {
      result += `**該当箇所**: ${feedback.line_number}行目\n\n`;
    }

    result += `**問題点**: ${feedback.problem_point}\n\n`;
    result += `**提案**: ${feedback.suggestion}\n\n`;

    return result;
  }
}
