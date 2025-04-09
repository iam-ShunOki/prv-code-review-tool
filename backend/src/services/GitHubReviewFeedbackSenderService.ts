// backend/src/services/GitHubReviewFeedbackSenderService.ts
import { AppDataSource } from "../index";
import { Review } from "../models/Review";
import { GitHubService } from "./GitHubService";
import { FeedbackService } from "./FeedbackService";
import { CodeSubmission } from "../models/CodeSubmission";
import {
  Feedback,
  FeedbackCategory,
  FeedbackPriority,
} from "../models/Feedback";
import { GitHubPullRequestTracker } from "../models/GitHubPullRequestTracker";
import { GitHubRepository } from "../models/GitHubRepository";

/**
 * GitHubのPRにAIレビュー結果をコメントとして送信するサービス
 */
export class GitHubReviewFeedbackSenderService {
  private githubService: GitHubService;
  private feedbackService: FeedbackService;
  private reviewRepository = AppDataSource.getRepository(Review);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private feedbackRepository = AppDataSource.getRepository(Feedback);
  private trackerRepository = AppDataSource.getRepository(
    GitHubPullRequestTracker
  );
  private repositoryRepository = AppDataSource.getRepository(GitHubRepository);

  constructor() {
    this.githubService = new GitHubService();
    this.feedbackService = new FeedbackService();
  }

  /**
   * AIレビュー結果をGitHub PRにコメントとして送信
   */
  async sendReviewFeedbackToPullRequest(
    owner: string,
    repo: string,
    pullRequestId: number,
    reviewToken: string,
    feedbacks: Array<any>,
    reviewContext?: {
      isReReview?: boolean;
      sourceCommentId?: number;
    }
  ): Promise<boolean> {
    console.log(
      `GitHub PR #${pullRequestId} (${owner}/${repo}) にレビュー結果を送信します`
    );

    try {
      // リポジトリ設定を取得
      const repository = await this.repositoryRepository.findOne({
        where: { owner, name: repo },
      });

      if (!repository) {
        console.error(`リポジトリ ${owner}/${repo} が見つかりません`);
        return false;
      }

      // GitHubサービスを初期化
      this.githubService.initializeWithToken(repository.access_token);

      // フィードバックをマークダウン形式に変換
      const markdownFeedback = this.formatFeedbacksToMarkdown(
        feedbacks,
        reviewContext?.isReReview || false,
        reviewToken
      );

      // GitHub PRにコメントを送信
      await this.githubService.addPullRequestComment(
        owner,
        repo,
        pullRequestId,
        markdownFeedback
      );

      // 処理履歴を更新
      const tracker = await this.trackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: pullRequestId,
        },
      });

      if (tracker) {
        // レビュー履歴を更新
        let reviewHistory = [];
        try {
          reviewHistory = JSON.parse(tracker.review_history || "[]");
        } catch (e) {
          console.warn("レビュー履歴のパースエラー:", e);
        }

        reviewHistory.push({
          date: new Date().toISOString(),
          review_token: reviewToken,
          feedback_count: feedbacks.length,
          is_re_review: reviewContext?.isReReview || false,
          source_comment_id: reviewContext?.sourceCommentId,
        });

        tracker.review_history = JSON.stringify(reviewHistory);
        tracker.last_review_at = new Date();
        tracker.review_count = tracker.review_count + 1;

        await this.trackerRepository.save(tracker);
      }

      console.log(
        `GitHub PR #${pullRequestId} へのレビュー結果送信が完了しました`
      );
      return true;
    } catch (error) {
      console.error(
        `レビュー結果送信エラー (${owner}/${repo}#${pullRequestId}):`,
        error
      );
      return false;
    }
  }

  /**
   * フィードバックをGitHub用マークダウン形式に変換
   */
  private formatFeedbacksToMarkdown(
    feedbacks: Array<any>,
    isReReview: boolean,
    reviewToken: string
  ): string {
    // カテゴリごとにフィードバックをグループ化
    const categorizedFeedbacks: { [key: string]: Array<any> } = {};

    // カテゴリが未設定のフィードバックがあれば「その他」に分類
    feedbacks.forEach((feedback) => {
      const category = feedback.category || "other";
      if (!categorizedFeedbacks[category]) {
        categorizedFeedbacks[category] = [];
      }
      categorizedFeedbacks[category].push(feedback);
    });

    // マークダウンを構築
    let markdown = "";

    // ヘッダー
    markdown += `# 🤖 AIコードレビュー結果\n\n`;

    if (isReReview) {
      markdown += `> 🔄 これは再レビューの結果です\n\n`;
    }

    markdown += `${new Date().toLocaleString("ja-JP")} に生成されました\n\n`;

    // サマリー
    markdown += `## 📊 レビューサマリー\n\n`;

    const totalIssues = feedbacks.length;
    const highPriorityCount = feedbacks.filter(
      (f) => f.priority === "high"
    ).length;
    const mediumPriorityCount = feedbacks.filter(
      (f) => f.priority === "medium"
    ).length;
    const lowPriorityCount = feedbacks.filter(
      (f) => f.priority === "low"
    ).length;

    markdown += `- 合計フィードバック: **${totalIssues}件**\n`;
    markdown += `- 優先度 高: **${highPriorityCount}件**\n`;
    markdown += `- 優先度 中: **${mediumPriorityCount}件**\n`;
    markdown += `- 優先度 低: **${lowPriorityCount}件**\n\n`;

    // カテゴリごとのフィードバック
    for (const [category, categoryFeedbacks] of Object.entries(
      categorizedFeedbacks
    )) {
      // カテゴリの表示名を取得
      const categoryDisplayName = this.getCategoryDisplayName(
        category as FeedbackCategory
      );

      markdown += `## ${categoryDisplayName} (${categoryFeedbacks.length}件)\n\n`;

      // 各フィードバックの詳細
      categoryFeedbacks.forEach((feedback, index) => {
        const priorityEmoji = this.getPriorityEmoji(feedback.priority);
        const priorityLabel = this.getPriorityLabel(feedback.priority);

        markdown += `### ${priorityEmoji} ${index + 1}. ${
          feedback.problem_point
        }\n\n`;
        markdown += `**優先度**: ${priorityLabel}\n\n`;
        markdown += `${feedback.suggestion}\n\n`;

        // コードスニペットがあれば表示
        if (feedback.code_snippet) {
          markdown += "```\n";
          markdown += feedback.code_snippet + "\n";
          markdown += "```\n\n";
        }

        // 参考URLがあれば表示
        if (feedback.reference_url) {
          markdown += `📚 **参考**: [${feedback.reference_url}](${feedback.reference_url})\n\n`;
        }

        // チェックボックス（GitHub Markdownの特徴）
        markdown += `- [ ] この問題を解決しました\n\n`;

        // 区切り線（最後のアイテム以外）
        if (index < categoryFeedbacks.length - 1) {
          markdown += `---\n\n`;
        }
      });
    }

    // フッター
    markdown += `\n\n---\n\n`;
    markdown += `> このレビューはAIによって自動生成されました。ご質問やフィードバックがあれば、PRにコメントで「@codereview」と記述してください。\n`;
    markdown += `> レビューID: \`${reviewToken}\``;

    return markdown;
  }

  /**
   * フィードバックカテゴリの表示名を取得
   */
  private getCategoryDisplayName(category: FeedbackCategory): string {
    const categoryDisplayNames: Record<string, string> = {
      code_quality: "💻 コード品質",
      security: "🔒 セキュリティ",
      performance: "⚡ パフォーマンス",
      best_practice: "📘 ベストプラクティス",
      readability: "📖 可読性",
      functionality: "✅ 機能性",
      maintainability: "🔧 保守性",
      architecture: "🏗️ アーキテクチャ",
      other: "📋 その他",
    };

    return categoryDisplayNames[category] || "📋 その他";
  }

  /**
   * 優先度に対応する絵文字を取得
   */
  private getPriorityEmoji(priority: FeedbackPriority): string {
    switch (priority) {
      case "high":
        return "🔴";
      case "medium":
        return "🟡";
      case "low":
        return "🟢";
      default:
        return "⚪";
    }
  }

  /**
   * 優先度のラベルを取得
   */
  private getPriorityLabel(priority: FeedbackPriority): string {
    switch (priority) {
      case "high":
        return "高";
      case "medium":
        return "中";
      case "low":
        return "低";
      default:
        return "未設定";
    }
  }

  /**
   * GitHub PR IDからレビュー履歴を取得
   */
  async getReviewHistoryByPR(
    owner: string,
    repo: string,
    pullRequestId: number
  ): Promise<any> {
    try {
      // PRトラッカーを取得
      const tracker = await this.trackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: pullRequestId,
        },
      });

      if (!tracker) {
        return null;
      }

      // レビュー履歴をパース
      try {
        return JSON.parse(tracker.review_history || "[]");
      } catch (e) {
        console.error("レビュー履歴のパースエラー:", e);
        return [];
      }
    } catch (error) {
      console.error(`PR #${pullRequestId} のレビュー履歴取得エラー:`, error);
      return null;
    }
  }
}
