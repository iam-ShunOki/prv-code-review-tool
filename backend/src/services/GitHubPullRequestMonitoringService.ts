// backend/src/services/GitHubPullRequestMonitoringService.ts
import { AppDataSource } from "../index";
import { GitHubRepository } from "../models/GitHubRepository";
import { GitHubPullRequestTracker } from "../models/GitHubPullRequestTracker";
import { GitHubService } from "./GitHubService";
import { MentionDetectionService } from "./MentionDetectionService";
import { AIService } from "./AIService";
import { GitHubReviewFeedbackSenderService } from "./GitHubReviewFeedbackSenderService";
import { In } from "typeorm";

/**
 * GitHub PRの監視と自動レビュー処理を行うサービス
 */
export class GitHubPullRequestMonitoringService {
  private githubService: GitHubService;
  private mentionDetectionService: MentionDetectionService;
  private aiService: AIService;
  private feedbackSenderService: GitHubReviewFeedbackSenderService;
  private githubRepositoryRepository =
    AppDataSource.getRepository(GitHubRepository);
  private trackerRepository = AppDataSource.getRepository(
    GitHubPullRequestTracker
  );

  constructor() {
    this.githubService = new GitHubService();
    this.mentionDetectionService = new MentionDetectionService();
    this.aiService = new AIService();
    this.feedbackSenderService = new GitHubReviewFeedbackSenderService();
  }

  /**
   * 既存のGitHub PRをチェック（起動時や定期実行用）
   */
  async checkExistingPullRequests(): Promise<{
    processed: number;
    skipped: number;
  }> {
    console.log("既存のGitHub PRをチェックします");
    let processed = 0;
    let skipped = 0;

    try {
      // アクティブなGitHubリポジトリを取得
      const repositories = await this.githubRepositoryRepository.find({
        where: {
          is_active: true,
          allow_auto_review: true,
        },
      });

      console.log(`チェック対象リポジトリ: ${repositories.length}件`);

      // 各リポジトリに対する処理
      for (const repo of repositories) {
        console.log(
          `リポジトリ "${repo.owner}/${repo.name}" をチェックしています`
        );

        try {
          // APIクライアントを初期化
          this.githubService.initializeWithToken(repo.access_token);

          // オープン状態のPRを取得
          const pullRequests = await this.getOpenPullRequests(
            repo.owner,
            repo.name
          );
          console.log(`オープンPR: ${pullRequests.length}件`);

          // 各PRを処理
          for (const pr of pullRequests) {
            try {
              const prNumber = pr.number;

              // PRの説明文をチェック
              const hasMentionInDescription =
                pr.body &&
                this.mentionDetectionService.detectCodeReviewMention(pr.body);

              if (hasMentionInDescription) {
                // 説明文に@codereviewメンションがある場合
                const isProcessed = await this.isPRDescriptionProcessed(
                  repo.owner,
                  repo.name,
                  prNumber
                );

                if (!isProcessed) {
                  // 未処理の場合は処理
                  const result = await this.checkSinglePullRequest(
                    repo.owner,
                    repo.name,
                    prNumber
                  );
                  if (result) {
                    processed++;
                    console.log(
                      `PR #${prNumber} (${repo.owner}/${repo.name}): 処理完了`
                    );
                  } else {
                    skipped++;
                    console.log(
                      `PR #${prNumber} (${repo.owner}/${repo.name}): 処理スキップ`
                    );
                  }
                } else {
                  skipped++;
                  console.log(
                    `PR #${prNumber} (${repo.owner}/${repo.name}): 説明文は既に処理済み`
                  );
                }
              }

              // コメントをチェック
              const comments = await this.githubService.getPullRequestComments(
                repo.owner,
                repo.name,
                prNumber
              );

              for (const comment of comments) {
                if (
                  comment.body &&
                  this.mentionDetectionService.detectCodeReviewMention(
                    comment.body
                  )
                ) {
                  // コメントに@codereviewメンションがある場合
                  const isProcessed = await this.isCommentProcessed(
                    repo.owner,
                    repo.name,
                    prNumber,
                    comment.id
                  );

                  if (!isProcessed) {
                    // 未処理の場合は処理
                    const result = await this.checkSinglePullRequest(
                      repo.owner,
                      repo.name,
                      prNumber,
                      comment.id
                    );
                    if (result) {
                      processed++;
                      console.log(
                        `PR #${prNumber} コメント#${comment.id} (${repo.owner}/${repo.name}): 処理完了`
                      );
                    } else {
                      skipped++;
                      console.log(
                        `PR #${prNumber} コメント#${comment.id} (${repo.owner}/${repo.name}): 処理スキップ`
                      );
                    }
                  } else {
                    skipped++;
                    console.log(
                      `PR #${prNumber} コメント#${comment.id} (${repo.owner}/${repo.name}): 既に処理済み`
                    );
                  }
                }
              }
            } catch (prError) {
              console.error(
                `PR #${pr.number} (${repo.owner}/${repo.name}) の処理中にエラー:`,
                prError
              );
            }
          }
        } catch (repoError) {
          console.error(
            `リポジトリ "${repo.owner}/${repo.name}" の処理中にエラー:`,
            repoError
          );
        }
      }
    } catch (error) {
      console.error("プルリクエストスキャン中にエラーが発生しました:", error);
    }

    console.log(
      `GitHub PRスキャン完了: 処理=${processed}件, スキップ=${skipped}件`
    );
    return { processed, skipped };
  }

  /**
   * 単一のプルリクエストをチェックしてAIレビューを実行
   */
  async checkSinglePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    commentId?: number
  ): Promise<boolean> {
    console.log(
      `PR #${prNumber} (${owner}/${repo}) をチェック${
        commentId ? ` (コメント#${commentId})` : ""
      }`
    );

    try {
      // リポジトリ設定を取得
      const repository = await this.githubRepositoryRepository.findOne({
        where: { owner, name: repo, is_active: true },
      });

      if (!repository) {
        console.log(
          `リポジトリ ${owner}/${repo} が見つからないか非アクティブです`
        );
        return false;
      }

      // リポジトリで自動レビューが有効か確認
      if (!repository.allow_auto_review) {
        console.log(`リポジトリ ${owner}/${repo} では自動レビューが無効です`);
        return false;
      }

      // GitHubサービスを初期化
      this.githubService.initializeWithToken(repository.access_token);

      // PRの詳細を取得（クローズされていないか確認）
      const prDetails = await this.githubService.getPullRequestDetails(
        owner,
        repo,
        prNumber
      );
      if (prDetails.state !== "open") {
        console.log(`PR #${prNumber} はクローズされているためスキップします`);
        return false;
      }

      // コメントIDを考慮して、既に処理済みかチェック
      let isAlreadyProcessed = false;
      if (commentId) {
        isAlreadyProcessed = await this.isCommentProcessed(
          owner,
          repo,
          prNumber,
          commentId
        );
      } else {
        isAlreadyProcessed = await this.isPRDescriptionProcessed(
          owner,
          repo,
          prNumber
        );
      }

      if (isAlreadyProcessed) {
        console.log(
          `PR #${prNumber} ${
            commentId ? `コメント#${commentId}` : "説明文"
          } は既に処理済みです`
        );
        return false;
      }

      // 既存のレビュー履歴を取得して再レビューかどうか判定
      const trackerRecord = await this.trackerRepository.findOne({
        where: { owner, repo, pull_request_id: prNumber },
      });

      const isReReview =
        trackerRecord !== null && trackerRecord.review_count > 0;
      let previousFeedbacks = null;

      // 再レビューの場合は前回のレビュー情報を取得
      if (isReReview) {
        console.log(
          `PR #${prNumber} は再レビューです（${trackerRecord.review_count}回目）`
        );
        // 本来はここで前回のフィードバック情報を取得する処理を実装
      }

      // PR差分を取得
      const diffData = await this.githubService.getPullRequestDiff(
        owner,
        repo,
        prNumber
      );

      // レビュートークンを生成
      const reviewToken = `github-review-${owner}-${repo}-${prNumber}-${Date.now()}`;

      // AIレビューを実行
      const reviewResult = await this.aiService.reviewGitHubPullRequest(
        owner,
        repo,
        prNumber,
        {
          isReReview,
          reviewToken,
          sourceCommentId: commentId,
          isDescriptionRequest: commentId === undefined,
          previousFeedbacks: previousFeedbacks || [],
        }
      );

      // レビュー結果をGitHubに送信
      await this.feedbackSenderService.sendReviewFeedbackToPullRequest(
        owner,
        repo,
        prNumber,
        reviewToken,
        reviewResult,
        {
          isReReview,
          sourceCommentId: commentId,
        }
      );

      // 処理済みとしてマーク
      if (commentId) {
        await this.markCommentAsProcessed(
          owner,
          repo,
          prNumber,
          commentId,
          repository.id
        );
      } else {
        await this.markPRDescriptionAsProcessed(
          owner,
          repo,
          prNumber,
          repository.id
        );
      }

      console.log(
        `PR #${prNumber} (${owner}/${repo}) のレビューが完了しました`
      );
      return true;
    } catch (error) {
      console.error(
        `PR #${prNumber} (${owner}/${repo}) のレビュー中にエラーが発生しました:`,
        error
      );
      return false;
    }
  }

  /**
   * 説明文が既に処理済みかをチェック
   */
  private async isPRDescriptionProcessed(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<boolean> {
    try {
      const tracker = await this.trackerRepository.findOne({
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
        `PR説明文の処理状態チェックエラー (${owner}/${repo}#${prNumber}):`,
        error
      );
      return false;
    }
  }

  /**
   * コメントが既に処理済みかをチェック
   */
  private async isCommentProcessed(
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number
  ): Promise<boolean> {
    try {
      const tracker = await this.trackerRepository.findOne({
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
        `コメント処理状態チェックエラー (${owner}/${repo}#${prNumber}, コメント#${commentId}):`,
        error
      );
      return false;
    }
  }

  /**
   * PR説明文を処理済みとしてマーク
   */
  private async markPRDescriptionAsProcessed(
    owner: string,
    repo: string,
    prNumber: number,
    repositoryId: number
  ): Promise<void> {
    try {
      const now = new Date();

      // 既存のトラッカーを検索
      let tracker = await this.trackerRepository.findOne({
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

        await this.trackerRepository.save(tracker);
        console.log(`PR #${prNumber} の説明文処理状態を更新しました`);
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

        await this.trackerRepository.save(newTracker);
        console.log(`PR #${prNumber} の新規トラッカーを作成しました`);
      }
    } catch (error) {
      console.error(
        `PR説明文の処理状態更新エラー (${owner}/${repo}#${prNumber}):`,
        error
      );
      throw error;
    }
  }

  /**
   * コメントを処理済みとしてマーク
   */
  private async markCommentAsProcessed(
    owner: string,
    repo: string,
    prNumber: number,
    commentId: number,
    repositoryId: number
  ): Promise<void> {
    try {
      const now = new Date();

      // 既存のトラッカーを検索
      let tracker = await this.trackerRepository.findOne({
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

        await this.trackerRepository.save(tracker);
        console.log(`コメント #${commentId} を処理済みとしてマークしました`);
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

        await this.trackerRepository.save(newTracker);
        console.log(
          `PR #${prNumber} の新規トラッカーを作成し、コメント #${commentId} を処理済みとしました`
        );
      }
    } catch (error) {
      console.error(
        `コメント処理状態更新エラー (${owner}/${repo}#${prNumber}, コメント#${commentId}):`,
        error
      );
      throw error;
    }
  }

  /**
   * チェックリストの進捗状況を取得
   */
  async getChecklistProgress(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<{ total: number; checked: number; rate: number }> {
    // この実装はダミーです。実際にはGitHubコメント内のチェックボックス状態を
    // トラッキングする機能が必要ですが、フェーズ3では実装しません。
    return {
      total: 0,
      checked: 0,
      rate: 0,
    };
  }

  /**
   * オープン状態のPRを取得
   */
  private async getOpenPullRequests(
    owner: string,
    repo: string
  ): Promise<any[]> {
    try {
      // GitHubサービスを使用してオープンPRを取得
      // この実装はダミーです
      return [];
    } catch (error) {
      console.error(`オープンPR取得エラー (${owner}/${repo}):`, error);
      return [];
    }
  }

  /**
   * プルリクエストのレビュー履歴を取得
   */
  async getPullRequestReviewHistory(
    owner: string,
    repo: string,
    pullRequestId: number
  ): Promise<any> {
    return this.feedbackSenderService.getReviewHistoryByPR(
      owner,
      repo,
      pullRequestId
    );
  }
}
