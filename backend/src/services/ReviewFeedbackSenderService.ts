// backend/src/services/ReviewFeedbackSenderService.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import {
  Feedback,
  FeedbackPriority,
  FeedbackCategory,
} from "../models/Feedback";
import { BacklogService } from "./BacklogService";
import { Not, IsNull, LessThan, Repository } from "typeorm";
import { RepositoryWhitelistService } from "./RepositoryWhitelistService";
import { FeedbackService } from "./FeedbackService";

export class ReviewFeedbackSenderService {
  private reviewRepository: Repository<Review>;
  private submissionRepository: Repository<CodeSubmission>;
  private feedbackRepository: Repository<Feedback>;
  private backlogService: BacklogService;
  private repositoryWhitelistService: RepositoryWhitelistService;
  private feedbackService: FeedbackService;

  constructor() {
    this.reviewRepository = AppDataSource.getRepository(Review);
    this.submissionRepository = AppDataSource.getRepository(CodeSubmission);
    this.feedbackRepository = AppDataSource.getRepository(Feedback);
    this.backlogService = new BacklogService();
    this.repositoryWhitelistService = RepositoryWhitelistService.getInstance();
    this.feedbackService = new FeedbackService();
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
        `レビュー #${reviewId} のフィードバックをBacklogに送信します`
      );

      // レビューを取得
      const review = await this.reviewRepository.findOne({
        where: { id: reviewId },
      });

      if (!review) {
        console.log(`レビュー #${reviewId} が見つかりません`);
        return false;
      }

      // PRとの関連を確認
      if (
        !review.backlog_pr_id ||
        !review.backlog_project ||
        !review.backlog_repository
      ) {
        console.log(
          `レビュー #${reviewId} はBacklog PRと関連付けられていません`
        );
        return false;
      }

      console.log(
        `レビュー #${reviewId} は PR #${review.backlog_pr_id} (${review.backlog_project}/${review.backlog_repository}) に関連付けられています`
      );

      // ホワイトリストチェック（強制返信フラグがなければ）
      if (!forceReply) {
        console.log(
          `${review.backlog_project}/${review.backlog_repository} のホワイトリストを確認します`
        );
        const isAllowed =
          await this.repositoryWhitelistService.isAutoReplyAllowed(
            review.backlog_project,
            review.backlog_repository
          );

        if (!isAllowed) {
          console.log(
            `${review.backlog_project}/${review.backlog_repository} は自動返信が許可されていません`
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
        console.log(`レビュー #${reviewId} にコード提出が見つかりません`);
        return false;
      }

      const latestSubmission = submissions[0];
      console.log(
        `最新のコード提出 #${latestSubmission.id} (バージョン ${latestSubmission.version}) を使用します`
      );

      // レビュー済みか確認
      if (latestSubmission.status !== SubmissionStatus.REVIEWED) {
        console.log(
          `コード提出 #${latestSubmission.id} はまだレビューされていません (ステータス: ${latestSubmission.status})`
        );
        return false;
      }

      // フィードバックを取得
      const feedbacks = await this.feedbackRepository.find({
        where: { submission_id: latestSubmission.id },
        order: { priority: "ASC", id: "ASC" },
      });

      console.log(
        `コード提出 #${latestSubmission.id} に対して ${feedbacks.length} 件のフィードバックが見つかりました`
      );

      // チェックリスト完了率を取得
      const checklistRate = await this.feedbackService.getChecklistRate(
        latestSubmission.id
      );
      console.log(
        `チェックリスト完了率: ${checklistRate.rate.toFixed(2)}% (${
          checklistRate.checked
        }/${checklistRate.total})`
      );

      // フィードバックをフォーマット
      const formattedFeedback = this.formatFeedbacksAsMarkdown(
        feedbacks,
        review,
        latestSubmission,
        checklistRate
      );

      // Backlogにコメントを送信
      try {
        console.log(`PR #${review.backlog_pr_id} にフィードバックを送信します`);
        await this.backlogService.addPullRequestComment(
          review.backlog_project,
          review.backlog_repository,
          review.backlog_pr_id,
          formattedFeedback
        );

        console.log(
          `PR #${review.backlog_pr_id} へのフィードバック送信に成功しました`
        );

        // 全てのフィードバックがチェック済みの場合はレビューステータスを完了に更新
        if (checklistRate.rate === 100) {
          await this.reviewRepository.update(reviewId, {
            status: ReviewStatus.COMPLETED,
          });
          console.log(`レビュー #${reviewId} のステータスを完了に更新しました`);
        }

        return true;
      } catch (apiError) {
        console.error(
          `Backlogへのコメント送信中にエラーが発生しました:`,
          apiError
        );

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
        `レビュー #${reviewId} のフィードバック送信中にエラーが発生しました:`,
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
    console.log("送信待ちのレビューフィードバックを確認しています");
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

      console.log(
        `送信待ちのレビューが ${pendingReviews.length} 件見つかりました`
      );

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
              `レビュー #${review.id} にはレビュー済みのコード提出があります。フィードバックを送信します`
            );

            // ホワイトリスト確認
            const isAllowed =
              await this.repositoryWhitelistService.isAutoReplyAllowed(
                review.backlog_project,
                review.backlog_repository
              );

            if (!isAllowed) {
              console.log(
                `${review.backlog_project}/${review.backlog_repository} は自動返信が許可されていません`
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
              `レビュー #${review.id} にはレビュー済みのコード提出がありません。スキップします`
            );
            skipped++;
          }
        } catch (reviewError) {
          console.error(
            `レビュー #${review.id} の処理中にエラーが発生しました:`,
            reviewError
          );
          failed++;
        }
      }

      return { success, failed, skipped };
    } catch (error) {
      console.error(
        "送信待ちレビューフィードバックの処理中にエラーが発生しました:",
        error
      );
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
        `PR #${pullRequestId} へのフィードバック (${feedback.length} 文字) を分割して送信します`
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
        `PR #${pullRequestId} への分割フィードバック送信中にエラーが発生しました:`,
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
    submission: CodeSubmission,
    checklistRate: { total: number; checked: number; rate: number }
  ): string {
    let markdown = "## AIコードレビュー結果（チェックリスト形式）\n\n";

    // レビュー情報を追加（簡潔に）
    markdown += `### レビュー情報\n`;
    markdown += `- PR: #${review.backlog_pr_id}\n`;
    markdown += `- レビュー日時: ${new Date().toLocaleString("ja-JP")}\n`;

    // チェックリストの進捗状況を追加
    markdown += `- チェックリスト進捗: ${checklistRate.checked}/${
      checklistRate.total
    } 項目 (${checklistRate.rate.toFixed(1)}%)\n\n`;

    // フィードバックがなければその旨を表示
    if (!feedbacks || feedbacks.length === 0) {
      markdown += "### 評価結果\n\n";
      markdown +=
        "このコードに重大な問題は見つかりませんでした。素晴らしいコードです！\n\n";
      return markdown;
    }

    // カテゴリごとにフィードバックを分類
    const categorizedFeedbacks: Record<string, Feedback[]> = {};

    // 未分類のフィードバックを格納するためのカテゴリ
    categorizedFeedbacks["未分類"] = [];

    // フィードバックをカテゴリごとに整理
    feedbacks.forEach((feedback) => {
      const categoryKey = feedback.category || "未分類";
      const categoryName = this.getCategoryDisplayName(categoryKey);

      if (!categorizedFeedbacks[categoryName]) {
        categorizedFeedbacks[categoryName] = [];
      }

      categorizedFeedbacks[categoryName].push(feedback);
    });

    // サマリーセクション
    markdown += "### サマリー\n\n";
    markdown += `- 合計レビュー項目: ${feedbacks.length}件\n`;
    Object.entries(categorizedFeedbacks).forEach(([category, items]) => {
      if (items.length > 0) {
        markdown += `- ${category}: ${items.length}件\n`;
      }
    });
    markdown += "\n";

    // チェックリスト進捗状況をビジュアル表示
    if (checklistRate.total > 0) {
      markdown += "### チェックリスト進捗\n\n";

      // プログレスバーの作成
      const barLength = 20;
      const filledLength = Math.round((checklistRate.rate / 100) * barLength);
      const emptyLength = barLength - filledLength;

      const progressBar = "■".repeat(filledLength) + "□".repeat(emptyLength);

      markdown += `${progressBar} ${checklistRate.rate.toFixed(1)}%\n\n`;

      // 完了率に応じてメッセージを変更
      if (checklistRate.rate === 100) {
        markdown += "**✅ すべてのチェックが完了しました！**\n\n";
      } else if (checklistRate.rate > 75) {
        markdown += "**⏳ もう少しでチェックが完了します！**\n\n";
      } else if (checklistRate.rate > 50) {
        markdown += "**🔄 チェックが進行中です。**\n\n";
      } else {
        markdown += "**🚀 チェックを開始しましょう！**\n\n";
      }
    }

    // カテゴリごとにチェックリスト形式でフィードバックを表示
    Object.entries(categorizedFeedbacks).forEach(
      ([category, categoryFeedbacks]) => {
        if (categoryFeedbacks.length === 0) return;

        markdown += `### ${category}のチェックリスト\n\n`;

        categoryFeedbacks.forEach((feedback, index) => {
          const checkStatus = feedback.is_checked ? "[x]" : "[ ]";
          markdown += `${checkStatus} **${index + 1}. ${
            feedback.problem_point
          }**\n\n`;

          // コードスニペットがある場合は表示
          if (feedback.code_snippet) {
            markdown += `\`\`\`\n${feedback.code_snippet}\n\`\`\`\n\n`;
          }

          markdown += `   **提案**: ${feedback.suggestion}\n\n`;

          // 参考リソースがある場合は表示
          if (feedback.reference_url) {
            markdown += `   **参考**: [詳細情報](${feedback.reference_url})\n\n`;
          }

          // チェック状態を表示
          if (feedback.is_checked) {
            markdown += `   **✅ 確認済み**`;
            if (feedback.checked_at) {
              const checkedDate = new Date(feedback.checked_at);
              markdown += ` (${checkedDate.toLocaleString("ja-JP")})\n\n`;
            } else {
              markdown += `\n\n`;
            }
          }

          markdown += "\n";
        });
      }
    );

    // フッター
    markdown += "---\n";
    markdown +=
      "このレビューはAIによって自動生成されました。チェックリストの各項目を確認し、問題が解決したら✅をつけてください。";

    return markdown;
  }

  /**
   * フィードバックカテゴリの表示名を取得
   */
  private getCategoryDisplayName(category: string): string {
    const categoryMap: Record<string, string> = {
      code_quality: "コード品質",
      security: "セキュリティ",
      performance: "パフォーマンス",
      best_practice: "ベストプラクティス",
      readability: "可読性",
      functionality: "機能性",
      maintainability: "保守性",
      architecture: "アーキテクチャ",
      other: "その他",
      未分類: "未分類",
    };

    return categoryMap[category] || category;
  }
}
