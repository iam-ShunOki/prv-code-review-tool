// src/services/ReviewFeedbackSenderService.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { BacklogService } from "./BacklogService";
import { Not, IsNull, LessThan, Repository } from "typeorm";
import { RepositoryWhitelistService } from "./RepositoryWhitelistService";

export class ReviewFeedbackSenderService {
  private reviewRepository: Repository<Review>;
  private submissionRepository: Repository<CodeSubmission>;
  private feedbackRepository: Repository<Feedback>;
  private backlogService: BacklogService;
  private repositoryWhitelistService: RepositoryWhitelistService;

  constructor() {
    this.reviewRepository = AppDataSource.getRepository(Review);
    this.submissionRepository = AppDataSource.getRepository(CodeSubmission);
    this.feedbackRepository = AppDataSource.getRepository(Feedback);
    this.backlogService = new BacklogService();
    this.repositoryWhitelistService = RepositoryWhitelistService.getInstance();
  }

  /**
   * 単一のレビューをBacklogに送信
   */
  async sendReviewFeedbackToPullRequest(
    reviewId: number,
    forceReply: boolean = false
  ): Promise<boolean> {
    try {
      console.log(
        `Attempting to send feedback for review #${reviewId} to Backlog`
      );

      // レビューを取得
      const review = await this.reviewRepository.findOne({
        where: { id: reviewId },
      });

      if (!review) {
        console.log(`Review #${reviewId} not found`);
        return false;
      }

      // PRとの関連を確認
      if (
        !review.backlog_pr_id ||
        !review.backlog_project ||
        !review.backlog_repository
      ) {
        console.log(`Review #${reviewId} is not associated with a Backlog PR`);
        return false;
      }

      console.log(
        `Review #${reviewId} is associated with PR #${review.backlog_pr_id} in ${review.backlog_project}/${review.backlog_repository}`
      );

      // ホワイトリストチェック（強制返信フラグがなければ）
      if (!forceReply) {
        console.log(
          `Checking whitelist for ${review.backlog_project}/${review.backlog_repository}`
        );
        const isAllowed =
          await this.repositoryWhitelistService.isAutoReplyAllowed(
            review.backlog_project,
            review.backlog_repository
          );

        if (!isAllowed) {
          console.log(
            `Auto-reply not allowed for ${review.backlog_project}/${review.backlog_repository}`
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
      console.log(
        `Using latest submission #${latestSubmission.id} (version ${latestSubmission.version})`
      );

      // レビュー済みか確認
      if (latestSubmission.status !== SubmissionStatus.REVIEWED) {
        console.log(
          `Submission #${latestSubmission.id} is not reviewed yet (status: ${latestSubmission.status})`
        );
        return false;
      }

      // フィードバックを取得
      const feedbacks = await this.feedbackRepository.find({
        where: { submission_id: latestSubmission.id },
        order: { priority: "ASC", id: "ASC" },
      });

      console.log(
        `Found ${feedbacks.length} feedbacks for submission #${latestSubmission.id}`
      );

      // フィードバックをフォーマット
      const formattedFeedback = this.formatFeedbacksAsMarkdown(
        feedbacks,
        review,
        latestSubmission
      );

      // Backlogにコメントを送信
      try {
        console.log(`Sending feedback to PR #${review.backlog_pr_id}`);
        await this.backlogService.addPullRequestComment(
          review.backlog_project,
          review.backlog_repository,
          review.backlog_pr_id,
          formattedFeedback
        );

        console.log(
          `Successfully sent feedback to PR #${review.backlog_pr_id}`
        );

        // レビューステータスを完了に更新
        await this.reviewRepository.update(reviewId, {
          status: ReviewStatus.COMPLETED,
        });

        return true;
      } catch (apiError) {
        console.error(`Error sending comment to Backlog:`, apiError);

        // コメントが長すぎる場合は分割して送信を試みる
        if (formattedFeedback.length > 10000) {
          return await this.sendSplitFeedback(
            review.backlog_project,
            review.backlog_repository,
            review.backlog_pr_id,
            formattedFeedback,
            reviewId
          );
        }

        throw apiError;
      }
    } catch (error) {
      console.error(
        `Error sending review feedback for review #${reviewId}:`,
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
    console.log("Checking for pending review feedbacks to send to Backlog");
    let success = 0;
    let failed = 0;
    let skipped = 0;

    try {
      // Backlog PRに関連付けられていて、IN_PROGRESS状態のレビューを検索
      const pendingReviews = await this.reviewRepository.find({
        where: {
          backlog_pr_id: Not(IsNull()),
          backlog_project: Not(IsNull()),
          backlog_repository: Not(IsNull()),
          status: ReviewStatus.IN_PROGRESS,
        },
      });

      console.log(`Found ${pendingReviews.length} pending reviews`);

      for (const review of pendingReviews) {
        try {
          // 最新の提出を取得
          const latestSubmission = await this.submissionRepository.findOne({
            where: { review_id: review.id },
            order: { version: "DESC" },
          });

          // レビュー済みかチェック
          if (latestSubmission?.status === SubmissionStatus.REVIEWED) {
            console.log(
              `Review #${review.id} has reviewed submission, sending feedback`
            );

            // ホワイトリスト確認
            const isAllowed =
              await this.repositoryWhitelistService.isAutoReplyAllowed(
                review.backlog_project,
                review.backlog_repository
              );

            if (!isAllowed) {
              console.log(
                `Auto-reply not allowed for ${review.backlog_project}/${review.backlog_repository}`
              );
              skipped++;
              continue;
            }

            // フィードバック送信
            const result = await this.sendReviewFeedbackToPullRequest(
              review.id
            );

            if (result) {
              success++;
            } else {
              failed++;
            }
          } else {
            console.log(
              `Review #${review.id} has no reviewed submission yet, skipping`
            );
            skipped++;
          }
        } catch (reviewError) {
          console.error(`Error processing review #${review.id}:`, reviewError);
          failed++;
        }
      }

      return { success, failed, skipped };
    } catch (error) {
      console.error("Error sending pending review feedbacks:", error);
      return { success, failed, skipped };
    }
  }

  /**
   * コメントを分割して送信（コメントが長すぎる場合）
   */
  private async sendSplitFeedback(
    projectKey: string,
    repoName: string,
    pullRequestId: number,
    feedback: string,
    reviewId: number
  ): Promise<boolean> {
    try {
      console.log(
        `Splitting feedback for PR #${pullRequestId} (${feedback.length} chars)`
      );

      // 最大コメント長
      const MAX_COMMENT_LENGTH = 8000;

      // ヘッダーとフッター
      const header =
        "## AIコードレビュー結果 (複数コメントに分割されています)\n\n";
      const footer = "\n\n---\nこのレビューはAIによって自動生成されました。";

      // 分割ポイントを計算
      const parts = [];
      let remainingContent = feedback;

      while (remainingContent.length > 0) {
        const partSize = Math.min(
          MAX_COMMENT_LENGTH - header.length - footer.length,
          remainingContent.length
        );
        let partContent = remainingContent.substring(0, partSize);

        // マークダウンの見出しやリストの途中で切れないよう調整
        if (remainingContent.length > partSize) {
          // 最後の段落や見出しの終わりで分割
          const lastBreakPoint = Math.max(
            partContent.lastIndexOf("\n\n"),
            partContent.lastIndexOf("\n### "),
            partContent.lastIndexOf("\n## "),
            partContent.lastIndexOf("\n# ")
          );

          if (lastBreakPoint > partSize / 2) {
            partContent = remainingContent.substring(0, lastBreakPoint);
          }
        }

        parts.push(header + partContent + footer);
        remainingContent = remainingContent.substring(partContent.length);
      }

      // 各パートに番号付け
      for (let i = 0; i < parts.length; i++) {
        const partHeader: string = `## AIコードレビュー結果 (${i + 1}/${
          parts.length
        })\n\n`;
        parts[i] = parts[i].replace(header, partHeader);
      }

      // 順次送信
      for (const part of parts) {
        await this.backlogService.addPullRequestComment(
          projectKey,
          repoName,
          pullRequestId,
          part
        );

        // APIレート制限を考慮して少し待機
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // レビューステータスを完了に更新
      await this.reviewRepository.update(reviewId, {
        status: ReviewStatus.COMPLETED,
      });

      return true;
    } catch (error) {
      console.error(
        `Error sending split feedback for PR #${pullRequestId}:`,
        error
      );
      return false;
    }
  }

  /**
   * フィードバックをマークダウン形式に整形
   */
  private formatFeedbacksAsMarkdown(
    feedbacks: Feedback[],
    review: Review,
    submission: CodeSubmission
  ): string {
    let markdown = "## AIコードレビュー結果\n\n";

    // レビュー情報を追加
    markdown += `### レビュー情報\n\n`;
    markdown += `- PR: #${review.backlog_pr_id}\n`;
    markdown += `- プロジェクト: ${review.backlog_project}\n`;
    markdown += `- リポジトリ: ${review.backlog_repository}\n`;
    markdown += `- レビュー日時: ${new Date().toLocaleString("ja-JP")}\n\n`;

    // フィードバックがなければその旨を表示
    if (!feedbacks || feedbacks.length === 0) {
      markdown += "### 評価結果\n\n";
      markdown +=
        "このコードに重大な問題は見つかりませんでした。素晴らしいコードです！\n\n";
      return markdown;
    }

    // 優先度ごとにフィードバックを分類
    const highPriority = feedbacks.filter(
      (f) => f.priority === FeedbackPriority.HIGH
    );
    const mediumPriority = feedbacks.filter(
      (f) => f.priority === FeedbackPriority.MEDIUM
    );
    const lowPriority = feedbacks.filter(
      (f) => f.priority === FeedbackPriority.LOW
    );

    // サマリーセクション
    markdown += "### サマリー\n\n";
    markdown += `- 高優先度の問題: ${highPriority.length}件\n`;
    markdown += `- 中優先度の問題: ${mediumPriority.length}件\n`;
    markdown += `- 低優先度の問題: ${lowPriority.length}件\n`;
    markdown += `- 合計: ${feedbacks.length}件\n\n`;

    // 高優先度のフィードバック
    if (highPriority.length > 0) {
      markdown += "### 🔴 高優先度の問題\n\n";
      highPriority.forEach((feedback, index) => {
        markdown += this.formatSingleFeedback(feedback, index + 1);
      });
    }

    // 中優先度のフィードバック
    if (mediumPriority.length > 0) {
      markdown += "### 🟠 中優先度の問題\n\n";
      mediumPriority.forEach((feedback, index) => {
        markdown += this.formatSingleFeedback(feedback, index + 1);
      });
    }

    // 低優先度のフィードバック
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
      result += `**該当行**: ${feedback.line_number}行目\n\n`;
    }

    result += `**問題点**: ${feedback.problem_point}\n\n`;
    result += `**提案**: ${feedback.suggestion}\n\n`;

    return result;
  }
}
