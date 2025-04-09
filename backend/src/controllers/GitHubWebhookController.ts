import { Request, Response } from "express";
import { GitHubService } from "../services/GitHubService";
import { AppDataSource } from "../index";
import { GitHubRepository } from "../models/GitHubRepository";
import { GitHubPullRequestTracker } from "../models/GitHubPullRequestTracker";
import { MentionDetectionService } from "../services/MentionDetectionService";

export class GitHubWebhookController {
  private githubService: GitHubService;
  private mentionDetectionService: MentionDetectionService;
  private githubRepositoryRepository =
    AppDataSource.getRepository(GitHubRepository);
  private githubPullRequestTrackerRepository = AppDataSource.getRepository(
    GitHubPullRequestTracker
  );

  constructor() {
    this.githubService = new GitHubService();
    this.mentionDetectionService = new MentionDetectionService();
  }

  /**
   * GitHub Webhookエンドポイント
   */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      // Event typeを取得
      const eventType = req.headers["x-github-event"] as string;
      console.log(`GitHub Webhook受信: ${eventType}`);

      // Webhookの整合性チェック
      const verified = await this.verifyWebhookSignature(req);
      if (!verified) {
        console.warn("Webhookシグネチャ検証失敗");
        res.status(401).json({
          success: false,
          message: "署名検証に失敗しました",
        });
        return;
      }

      const payload = req.body;

      // イベントタイプに応じた処理
      switch (eventType) {
        case "pull_request":
          await this.processPullRequestEvent(payload);
          break;
        case "issue_comment":
          if (payload.issue && payload.issue.pull_request) {
            // PRへのコメントの場合
            await this.processIssueCommentEvent(payload);
          }
          break;
        case "pull_request_review_comment":
          await this.processPRReviewCommentEvent(payload);
          break;
        default:
          console.log(`サポートされていないイベントタイプ: ${eventType}`);
      }

      res.status(200).json({
        success: true,
        message: "Webhookを正常に処理しました",
      });
    } catch (error) {
      console.error("Webhook処理エラー:", error);
      res.status(500).json({
        success: false,
        message: "Webhookの処理中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * Webhookの署名を検証
   */
  private verifyWebhookSignature = async (req: Request): Promise<boolean> => {
    const signature = req.headers["x-hub-signature"] as string;
    if (!signature) {
      console.warn("x-hub-signature ヘッダーがありません");
      return false;
    }

    try {
      // リポジトリ情報を取得
      const owner = req.body.repository?.owner?.login;
      const repo = req.body.repository?.name;

      if (!owner || !repo) {
        console.warn("リポジトリ情報が不完全です");
        return false;
      }

      // DBからリポジトリ設定を取得
      const repository = await this.githubRepositoryRepository.findOne({
        where: { owner, name: repo },
      });

      if (!repository || !repository.webhook_secret) {
        console.warn(
          `リポジトリ ${owner}/${repo} の設定が見つからないか、Webhookシークレットが設定されていません`
        );
        return false;
      }

      // 署名を検証
      const rawBody = JSON.stringify(req.body);
      return this.githubService.verifyWebhookSignature(
        rawBody,
        signature,
        repository.webhook_secret
      );
    } catch (error) {
      console.error("署名検証エラー:", error);
      return false;
    }
  };

  /**
   * PullRequestイベントを処理
   */
  private processPullRequestEvent = async (payload: any): Promise<void> => {
    const { action, pull_request, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pull_request.number;

    console.log(
      `PR #${prNumber} (${owner}/${repo}) ${action}イベントを処理します`
    );

    // PR作成/更新イベントだけ処理（closed/mergedは無視）
    if (
      action !== "opened" &&
      action !== "synchronize" &&
      action !== "reopened"
    ) {
      console.log(`アクション '${action}' はスキップします`);
      return;
    }

    // PRの詳細を取得
    try {
      // リポジトリ設定を取得
      const repositoryConfig = await this.githubRepositoryRepository.findOne({
        where: { owner, name: repo },
      });

      if (!repositoryConfig || !repositoryConfig.is_active) {
        console.log(
          `リポジトリ ${owner}/${repo} は登録されていないか、非アクティブです`
        );
        return;
      }

      // APIクライアントを初期化
      this.githubService.initializeWithToken(repositoryConfig.access_token);

      // PR本文の@codereviewメンションをチェック
      const prBody = pull_request.body || "";
      const hasMention =
        this.mentionDetectionService.detectCodeReviewMention(prBody);

      if (hasMention) {
        console.log(
          `PR #${prNumber} の本文に @codereview メンションがあります`
        );

        // 処理済みかチェック
        const isProcessed = await this.isPRAlreadyProcessed(
          owner,
          repo,
          prNumber
        );
        if (isProcessed) {
          console.log(`PR #${prNumber} は既に処理済みです`);
          return;
        }

        // [実装予定] ここでAIレビュー処理を実行
        console.log(`PR #${prNumber} のAIレビューを開始します（実装予定）`);

        // 処理としてマーク
        await this.markPRAsProcessed(
          owner,
          repo,
          prNumber,
          repositoryConfig.id
        );
      } else {
        console.log(
          `PR #${prNumber} の本文に @codereview メンションはありません`
        );
      }
    } catch (error) {
      console.error(`PR処理エラー (${owner}/${repo}#${prNumber}):`, error);
      throw error;
    }
  };

  /**
   * Issueコメントイベント（PRへのコメント）を処理
   */
  private processIssueCommentEvent = async (payload: any): Promise<void> => {
    const { action, comment, issue, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = issue.number;
    const commentId = comment.id;

    console.log(
      `PR #${prNumber} (${owner}/${repo}) コメント#${commentId} ${action}イベントを処理します`
    );

    // コメント作成イベントのみ処理
    if (action !== "created") {
      console.log(`アクション '${action}' はスキップします`);
      return;
    }

    // リポジトリ設定を取得
    const repositoryConfig = await this.githubRepositoryRepository.findOne({
      where: { owner, name: repo },
    });

    if (
      !repositoryConfig ||
      !repositoryConfig.is_active ||
      !repositoryConfig.allow_auto_review
    ) {
      console.log(
        `リポジトリ ${owner}/${repo} は登録されていないか、自動レビューが無効です`
      );
      return;
    }

    // APIクライアントを初期化
    this.githubService.initializeWithToken(repositoryConfig.access_token);

    // コメント内容の@codereviewメンションをチェック
    const commentBody = comment.body || "";
    const hasMention =
      this.mentionDetectionService.detectCodeReviewMention(commentBody);

    if (hasMention) {
      console.log(`コメント #${commentId} に @codereview メンションがあります`);

      // このコメントIDが処理済みかチェック
      const isCommentProcessed = await this.isCommentAlreadyProcessed(
        owner,
        repo,
        prNumber,
        commentId
      );
      if (isCommentProcessed) {
        console.log(`コメント #${commentId} は既に処理済みです`);
        return;
      }

      // [実装予定] ここでAIレビュー処理を実行
      console.log(`PR #${prNumber} のAIレビューを開始します（実装予定）`);

      // コメントIDを処理済みとしてマーク
      await this.markCommentAsProcessed(
        owner,
        repo,
        prNumber,
        commentId,
        repositoryConfig.id
      );
    } else {
      console.log(
        `コメント #${commentId} に @codereview メンションはありません`
      );
    }
  };

  /**
   * PR Review Commentイベントを処理
   */
  private processPRReviewCommentEvent = async (payload: any): Promise<void> => {
    const { action, comment, pull_request, repository } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pull_request.number;
    const commentId = comment.id;

    console.log(
      `PR #${prNumber} (${owner}/${repo}) レビューコメント#${commentId} ${action}イベントを処理します`
    );

    // コメント作成イベントのみ処理
    if (action !== "created") {
      console.log(`アクション '${action}' はスキップします`);
      return;
    }

    // リポジトリ設定を取得
    const repositoryConfig = await this.githubRepositoryRepository.findOne({
      where: { owner, name: repo },
    });

    if (
      !repositoryConfig ||
      !repositoryConfig.is_active ||
      !repositoryConfig.allow_auto_review
    ) {
      console.log(
        `リポジトリ ${owner}/${repo} は登録されていないか、自動レビューが無効です`
      );
      return;
    }

    // APIクライアントを初期化
    this.githubService.initializeWithToken(repositoryConfig.access_token);

    // コメント内容の@codereviewメンションをチェック
    const commentBody = comment.body || "";
    const hasMention =
      this.mentionDetectionService.detectCodeReviewMention(commentBody);

    if (hasMention) {
      console.log(
        `レビューコメント #${commentId} に @codereview メンションがあります`
      );

      // このコメントIDが処理済みかチェック
      const isCommentProcessed = await this.isCommentAlreadyProcessed(
        owner,
        repo,
        prNumber,
        commentId
      );
      if (isCommentProcessed) {
        console.log(`レビューコメント #${commentId} は既に処理済みです`);
        return;
      }

      // [実装予定] ここでAIレビュー処理を実行
      console.log(`PR #${prNumber} のAIレビューを開始します（実装予定）`);

      // コメントIDを処理済みとしてマーク
      await this.markCommentAsProcessed(
        owner,
        repo,
        prNumber,
        commentId,
        repositoryConfig.id
      );
    } else {
      console.log(
        `レビューコメント #${commentId} に @codereview メンションはありません`
      );
    }
  };

  /**
   * PRが既に処理済みかをチェック
   */
  private isPRAlreadyProcessed = async (
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<boolean> => {
    try {
      const tracker = await this.githubPullRequestTrackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: prNumber,
          description_processed: true,
        },
      });

      return !!tracker;
    } catch (error) {
      console.error(
        `PR処理済みチェックエラー (${owner}/${repo}#${prNumber}):`,
        error
      );
      return false;
    }
  };

  /**
   * コメントが既に処理済みかをチェック
   */
  private isCommentAlreadyProcessed = async (
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number
  ): Promise<boolean> => {
    try {
      const tracker = await this.githubPullRequestTrackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: prNumber,
        },
      });

      if (!tracker) return false;

      try {
        const processedCommentIds = JSON.parse(
          tracker.processed_comment_ids || "[]"
        );
        return processedCommentIds.includes(commentId);
      } catch (e) {
        console.error("処理済みコメントIDのパースエラー:", e);
        return false;
      }
    } catch (error) {
      console.error(
        `コメント処理済みチェックエラー (${owner}/${repo}#${prNumber}, コメント#${commentId}):`,
        error
      );
      return false;
    }
  };

  /**
   * PRを処理済みとしてマーク
   */
  private markPRAsProcessed = async (
    owner: string,
    repo: string,
    prNumber: number,
    repositoryId: number
  ): Promise<void> => {
    try {
      const now = new Date();

      // 既存のトラッカーを検索
      let tracker = await this.githubPullRequestTrackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: prNumber,
        },
      });

      if (tracker) {
        // 更新
        tracker.processed_at = now;
        tracker.last_review_at = now;
        tracker.review_count = tracker.review_count + 1;
        tracker.description_processed = true;

        // レビュー履歴更新
        let reviewHistory = [];
        try {
          reviewHistory = JSON.parse(tracker.review_history || "[]");
        } catch (e) {
          console.warn("レビュー履歴のパースエラー:", e);
        }

        reviewHistory.push({
          date: now.toISOString(),
          is_description_request: true,
        });

        tracker.review_history = JSON.stringify(reviewHistory);

        await this.githubPullRequestTrackerRepository.save(tracker);
        console.log(`既存のトラッカーを更新しました: PR #${prNumber}`);
      } else {
        // 新規作成
        const newTracker = new GitHubPullRequestTracker();
        newTracker.repository_id = repositoryId;
        newTracker.owner = owner;
        newTracker.repo = repo;
        newTracker.pull_request_id = prNumber;
        newTracker.processed_at = now;
        newTracker.last_review_at = now;
        newTracker.review_count = 1;
        newTracker.description_processed = true;
        newTracker.processed_comment_ids = "[]";
        newTracker.review_history = JSON.stringify([
          {
            date: now.toISOString(),
            is_description_request: true,
          },
        ]);

        await this.githubPullRequestTrackerRepository.save(newTracker);
        console.log(`新規トラッカーを作成しました: PR #${prNumber}`);
      }
    } catch (error) {
      console.error(
        `PR処理済みマーク設定エラー (${owner}/${repo}#${prNumber}):`,
        error
      );
      throw error;
    }
  };

  /**
   * コメントを処理済みとしてマーク
   */
  private markCommentAsProcessed = async (
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number,
    repositoryId: number
  ): Promise<void> => {
    try {
      const now = new Date();

      // 既存のトラッカーを検索
      let tracker = await this.githubPullRequestTrackerRepository.findOne({
        where: {
          owner,
          repo,
          pull_request_id: prNumber,
        },
      });

      if (tracker) {
        // 更新
        tracker.processed_at = now;
        tracker.last_review_at = now;
        tracker.review_count = tracker.review_count + 1;

        // 処理済みコメントID追加
        let processedCommentIds = [];
        try {
          processedCommentIds = JSON.parse(
            tracker.processed_comment_ids || "[]"
          );
        } catch (e) {
          console.warn("処理済みコメントIDのパースエラー:", e);
        }

        if (!processedCommentIds.includes(commentId)) {
          processedCommentIds.push(commentId);
        }

        tracker.processed_comment_ids = JSON.stringify(processedCommentIds);

        // レビュー履歴更新
        let reviewHistory = [];
        try {
          reviewHistory = JSON.parse(tracker.review_history || "[]");
        } catch (e) {
          console.warn("レビュー履歴のパースエラー:", e);
        }

        reviewHistory.push({
          date: now.toISOString(),
          comment_id: commentId,
          is_description_request: false,
        });

        tracker.review_history = JSON.stringify(reviewHistory);

        await this.githubPullRequestTrackerRepository.save(tracker);
        console.log(
          `既存のトラッカーを更新しました: PR #${prNumber}, コメント #${commentId}`
        );
      } else {
        // 新規作成
        const newTracker = new GitHubPullRequestTracker();
        newTracker.repository_id = repositoryId;
        newTracker.owner = owner;
        newTracker.repo = repo;
        newTracker.pull_request_id = prNumber;
        newTracker.processed_at = now;
        newTracker.last_review_at = now;
        newTracker.review_count = 1;
        newTracker.description_processed = false;
        newTracker.processed_comment_ids = JSON.stringify([commentId]);
        newTracker.review_history = JSON.stringify([
          {
            date: now.toISOString(),
            comment_id: commentId,
            is_description_request: false,
          },
        ]);

        await this.githubPullRequestTrackerRepository.save(newTracker);
        console.log(
          `新規トラッカーを作成しました: PR #${prNumber}, コメント #${commentId}`
        );
      }
    } catch (error) {
      console.error(
        `コメント処理済みマーク設定エラー (${owner}/${repo}#${prNumber}, コメント#${commentId}):`,
        error
      );
      throw error;
    }
  };
}
