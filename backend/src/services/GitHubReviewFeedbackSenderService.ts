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
   * AIレビュー結果をGitHub PRにコメントとして送信（教育目的最適化版）
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
      isDescriptionRequest?: boolean;
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
      this.githubService = new GitHubService(); // 新しいインスタンスを作成
      const initResult = this.githubService.initializeWithToken(
        repository.access_token
      );

      if (!initResult) {
        console.error(`GitHub API初期化に失敗しました`);
        return false;
      }

      // 改善点と良い点の数をカウント
      const strengthCount = feedbacks.filter(
        (f) => f.feedback_type === "strength"
      ).length;
      const improvementCount = feedbacks.filter(
        (f) => f.feedback_type === "improvement"
      ).length;

      console.log(
        `レビュー結果: 良い点=${strengthCount}件, 改善点=${improvementCount}件`
      );

      // フィードバックをマークダウン形式に変換（教育目的最適化版）
      const markdownFeedback = this.formatFeedbacksToMarkdown(
        feedbacks,
        reviewContext?.isReReview || false,
        reviewToken
      );

      // 送信内容のプレビューをログ出力（デバッグ用）
      console.log(
        "マークダウン生成完了: 長さ=" + markdownFeedback.length + "文字"
      );

      // GitHub PRにコメントを送信
      let commentResponse;
      try {
        commentResponse = await this.githubService.addPullRequestComment(
          owner,
          repo,
          pullRequestId,
          markdownFeedback
        );
        console.log(
          `PR #${pullRequestId} にレビューコメントを送信しました: コメントID=${commentResponse.id}`
        );
      } catch (commentError) {
        console.error(`コメント送信エラー:`, commentError);
        return false;
      }

      // 現在時刻
      const now = new Date();

      // 処理履歴を更新
      let tracker = await this.trackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: pullRequestId,
        },
      });

      // トラッカーが存在しない場合（初回レビューで処理済みマークがまだ設定されていない場合）
      if (!tracker) {
        console.log(
          `PR #${pullRequestId} のトラッカーが存在しません。新しく作成します。`
        );

        tracker = new GitHubPullRequestTracker();
        tracker.repository_id = repository.id;
        tracker.owner = owner;
        tracker.repo = repo;
        tracker.pull_request_id = pullRequestId;
        tracker.processed_at = now;
        tracker.last_review_at = now;
        tracker.review_count = 1;

        // 初回レビューなので、依頼コメントID/説明からの依頼状態は初期化だけ
        tracker.processed_comment_ids = JSON.stringify(
          reviewContext?.sourceCommentId ? [reviewContext.sourceCommentId] : []
        );
        tracker.description_processed =
          reviewContext?.isDescriptionRequest || false;

        // AIレビューコメントIDを初期化
        tracker.ai_review_comment_ids = JSON.stringify(
          commentResponse && commentResponse.id ? [commentResponse.id] : []
        );

        // レビュー履歴を初期化
        tracker.review_history = JSON.stringify([
          {
            date: now.toISOString(),
            review_token: reviewToken,
            strength_count: strengthCount,
            improvement_count: improvementCount,
            is_re_review: false,
            source_comment_id: reviewContext?.sourceCommentId,
            educational_focus: true,
            comment_id: commentResponse ? commentResponse.id : null,
          },
        ]);

        // トラッカーを保存
        await this.trackerRepository.save(tracker);
        console.log(`PR #${pullRequestId} の新しいトラッカーを作成しました`);

        return true; // 新規作成したので、以降の処理はスキップ
      }

      // 既存のトラッカーがある場合は更新
      // AIのレビューコメントIDを更新
      let aiReviewCommentIds = [];
      try {
        aiReviewCommentIds = JSON.parse(tracker.ai_review_comment_ids || "[]");
      } catch (e) {
        console.warn("AIレビューコメントIDのパースエラー:", e);
      }

      // 新しいコメントIDを追加（コメントのレスポンスが有効な場合）
      if (commentResponse && commentResponse.id) {
        aiReviewCommentIds.push(commentResponse.id);
        tracker.ai_review_comment_ids = JSON.stringify(aiReviewCommentIds);
        console.log(
          `AIレビューコメントID ${commentResponse.id} を追加しました: 合計${aiReviewCommentIds.length}件`
        );
      }

      // レビュー履歴を更新（教育目的要素を追加）
      let reviewHistory = [];
      try {
        reviewHistory = JSON.parse(tracker.review_history || "[]");
      } catch (e) {
        console.warn("レビュー履歴のパースエラー:", e);
      }

      // 前回のレビューがあれば成長指標を計算
      let growthIndicator = 0;
      if (reviewHistory.length > 0 && reviewContext?.isReReview) {
        const lastReview = reviewHistory[reviewHistory.length - 1];
        // 改善提案数が減っていれば成長指標が上がる
        if (lastReview.improvement_count > improvementCount) {
          growthIndicator = Math.min(
            100,
            Math.round(
              ((lastReview.improvement_count - improvementCount) /
                lastReview.improvement_count) *
                100
            )
          );
        }
      }

      // 新しいレビュー履歴エントリにコメントIDを含める
      reviewHistory.push({
        date: now.toISOString(),
        review_token: reviewToken,
        strength_count: strengthCount,
        improvement_count: improvementCount,
        is_re_review: reviewContext?.isReReview || false,
        source_comment_id: reviewContext?.sourceCommentId,
        growth_indicator: growthIndicator,
        educational_focus: true,
        comment_id: commentResponse ? commentResponse.id : null, // コメントIDを履歴に追加
      });

      tracker.review_history = JSON.stringify(reviewHistory);
      tracker.last_review_at = now;
      tracker.review_count = tracker.review_count + 1;

      await this.trackerRepository.save(tracker);
      console.log(
        `PR #${pullRequestId} のレビュー履歴を更新しました ${
          growthIndicator > 0 ? `(成長指標: ${growthIndicator}%)` : ""
        }`
      );

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
   * フィードバックをGitHub用マークダウン形式に変換（教育目的最適化版）
   */
  private formatFeedbacksToMarkdown(
    feedbacks: Array<any>,
    isReReview: boolean,
    reviewToken: string
  ): string {
    // 良い点と改善点を分類
    const strengths = feedbacks.filter((f) => f.feedback_type === "strength");
    const improvements = feedbacks.filter(
      (f) => f.feedback_type === "improvement"
    );

    // カテゴリごとに良い点をグループ化
    const categorizedStrengths: { [key: string]: Array<any> } = {};
    strengths.forEach((feedback) => {
      const category = feedback.category || "other";
      if (!categorizedStrengths[category]) {
        categorizedStrengths[category] = [];
      }
      categorizedStrengths[category].push(feedback);
    });

    // カテゴリごとに改善点をグループ化
    const categorizedImprovements: { [key: string]: Array<any> } = {};
    improvements.forEach((feedback) => {
      const category = feedback.category || "other";
      if (!categorizedImprovements[category]) {
        categorizedImprovements[category] = [];
      }
      categorizedImprovements[category].push(feedback);
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
    markdown += `- 良い点: **${strengths.length}件**\n`;
    markdown += `- 改善提案: **${improvements.length}件**\n`;
    markdown += `\n`;

    // 再レビューの場合は成長に関するコメントを追加
    if (isReReview) {
      markdown += `## 👏 前回からの成長\n\n`;
      markdown += `前回のレビューから修正を行っていただき、コードが改善されています。`;
      markdown += `特に良くなった点や、さらなる改善点については以下で詳しく解説します。\n\n`;
    }

    // 良い点のセクション
    if (strengths.length > 0) {
      markdown += `## ✅ 良い点\n\n`;

      // カテゴリごとの良い点
      for (const [category, categoryFeedbacks] of Object.entries(
        categorizedStrengths
      )) {
        // カテゴリの表示名を取得
        const categoryDisplayName = this.getCategoryDisplayName(
          category as FeedbackCategory
        );

        markdown += `### ${categoryDisplayName}\n\n`;

        // 各フィードバックの詳細
        categoryFeedbacks.forEach((feedback, index) => {
          markdown += `**${index + 1}. ${feedback.point}**\n\n`;

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

          // 区切り線（最後のアイテム以外）
          if (index < categoryFeedbacks.length - 1) {
            markdown += `---\n\n`;
          }
        });
      }
    }

    // 改善点のセクション
    if (improvements.length > 0) {
      markdown += `\n## 🔧 改善提案\n\n`;

      // カテゴリごとの改善点
      for (const [category, categoryFeedbacks] of Object.entries(
        categorizedImprovements
      )) {
        // カテゴリの表示名を取得
        const categoryDisplayName = this.getCategoryDisplayName(
          category as FeedbackCategory
        );

        markdown += `### ${categoryDisplayName}\n\n`;

        // 各フィードバックの詳細
        categoryFeedbacks.forEach((feedback, index) => {
          markdown += `#### ${index + 1}. ${feedback.point}\n\n`;

          if (feedback.suggestion) {
            markdown += `**改善案**: ${feedback.suggestion}\n\n`;
          }

          // コードスニペットがあれば表示
          if (feedback.code_snippet) {
            markdown += "```\n";
            markdown += feedback.code_snippet + "\n";
            markdown += "```\n\n";
          }

          // 参考URLがあれば表示
          if (feedback.reference_url) {
            markdown += `📚 **参考資料**: [${feedback.reference_url}](${feedback.reference_url})\n\n`;
          }

          // 区切り線（最後のアイテム以外）
          if (index < categoryFeedbacks.length - 1) {
            markdown += `---\n\n`;
          }
        });
      }
    }

    // 次のステップセクション（教育目的）
    markdown += `\n## 📝 学習のポイント\n\n`;
    markdown += `上記の改善提案は、単に「修正すべき問題」ではなく「学習の機会」として捉えてください。`;
    markdown += `プログラミングスキルを向上させるために、以下の点に注目してみてください：\n\n`;

    // 分類別のポイントをいくつか提案
    const learningPoints = [
      "コードの読みやすさは、自分だけでなく他の開発者にとっても重要です。変数名や関数名の意図が明確であれば、コードの理解が容易になります。",
      "小さな関数に分割することで、コードの再利用性や保守性が高まります。一つの関数が一つの責任を持つようにしましょう。",
      "エラーハンドリングはユーザー体験に直結します。想定外の入力や状況にも適切に対応できるコードを書くよう心がけてください。",
      "コードの効率性は、アプリケーションの応答性に影響します。特にループ処理や大量のデータを扱う場合は、処理方法を工夫することで大きな差が生まれます。",
    ];

    // ランダムに2つ選択
    const selectedPoints = learningPoints
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);

    selectedPoints.forEach((point, index) => {
      markdown += `${index + 1}. ${point}\n\n`;
    });

    // 学習リソース提案
    markdown += `### 📚 おすすめ学習リソース\n\n`;
    markdown += `* [MDN Web Docs](https://developer.mozilla.org/ja/) - Web開発に関する総合的なリファレンス\n`;
    markdown += `* [JavaScript.info](https://ja.javascript.info/) - モダンJavaScriptチュートリアル\n`;
    markdown += `* [Clean Code](https://www.amazon.co.jp/Clean-Code-%E3%82%A2%E3%82%B8%E3%83%A3%E3%82%A4%E3%83%AB%E3%82%BD%E3%83%95%E3%83%88%E3%82%A6%E3%82%A7%E3%82%A2%E9%81%94%E4%BA%BA%E3%81%AE%E6%8A%80-%E3%83%AD%E3%83%90%E3%83%BC%E3%83%88%E3%83%BBC%E3%83%BB%E3%83%9E%E3%83%BC%E3%83%81%E3%83%B3/dp/4048930591) - より良いコードを書くための実践的なガイド\n\n`;

    // フッター
    markdown += `\n\n---\n\n`;
    markdown += `> このレビューはAIによって自動生成されました。\nさらなるフィードバックが必要な場合は、askタグを入力するか、コード修正後にcodereviewタグとともに再度レビューを依頼してください。\n`;
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
