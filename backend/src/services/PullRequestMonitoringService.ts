// backend/src/services/PullRequestMonitoringService.ts
import { BacklogService } from "./BacklogService";
import { MentionDetectionService } from "./MentionDetectionService";
import { AutomaticReviewCreator } from "./AutomaticReviewCreator";
import { AppDataSource } from "../index";
import { PullRequestTracker } from "../models/PullRequestTracker";
import { Review } from "../models/Review";
import { In, Repository } from "typeorm";

export class PullRequestMonitoringService {
  private backlogService: BacklogService;
  private mentionDetectionService: MentionDetectionService;
  private automaticReviewCreator: AutomaticReviewCreator;
  private pullRequestTrackerRepository: Repository<PullRequestTracker>;
  private reviewRepository: Repository<Review>;

  constructor() {
    this.backlogService = new BacklogService();
    this.mentionDetectionService = new MentionDetectionService();
    this.automaticReviewCreator = new AutomaticReviewCreator();
    this.pullRequestTrackerRepository =
      AppDataSource.getRepository(PullRequestTracker);
    this.reviewRepository = AppDataSource.getRepository(Review);
  }

  /**
   * アプリケーション起動時に既存のプルリクエストをチェック
   */
  async checkExistingPullRequests(): Promise<{
    processed: number;
    skipped: number;
  }> {
    console.log("既存のプルリクエストをチェックします");
    let processed = 0;
    let skipped = 0;

    try {
      // プロジェクト一覧を取得
      const projects = await this.backlogService.getProjects();
      console.log(`${projects.length}件のプロジェクトが見つかりました`);

      for (const project of projects) {
        console.log(
          `プロジェクト「${project.projectKey}」をチェックしています`
        );

        try {
          // 特定のプロジェクトのみ処理する
          if (project.projectKey == "AD_TECHNOLOGY") {
            const repositories = await this.backlogService.getRepositories(
              project.projectKey
            );
            console.log(
              `プロジェクト「${project.projectKey}」内に${repositories.length}件のリポジトリが見つかりました`
            );

            for (const repo of repositories) {
              console.log(`リポジトリ「${repo.name}」をチェックしています`);

              try {
                // オープン状態のプルリクエスト一覧を取得
                const pullRequests = await this.backlogService.getPullRequests(
                  project.projectKey,
                  repo.name,
                  1
                );

                console.log(
                  `リポジトリ「${repo.name}」内に${pullRequests.length}件のオープンPRが見つかりました`
                );

                // すでに処理されているPR番号のリストを取得
                const trackers = await this.pullRequestTrackerRepository.find({
                  where: {
                    project_key: project.projectKey,
                    repository_name: repo.name,
                  },
                });

                const processedPrNumbers = new Set(
                  trackers.map((t) => t.pull_request_id)
                );
                console.log(
                  `このリポジトリですでに${processedPrNumbers.size}件のPRが処理済みです`
                );

                for (const pr of pullRequests) {
                  console.log(
                    `PR #${pr.number} (${pr.summary}) をチェックしています`
                  );

                  // PR詳細を取得
                  try {
                    const prDetails =
                      await this.backlogService.getPullRequestById(
                        project.projectKey,
                        repo.name,
                        pr.number
                      );

                    // PR詳細をログに出力
                    console.log(
                      `PR #${pr.number} 詳細:`,
                      JSON.stringify(prDetails, null, 2)
                    );

                    // @codereviewメンションをチェック
                    const hasMention =
                      this.mentionDetectionService.detectCodeReviewMention(
                        prDetails.description || ""
                      );

                    if (hasMention) {
                      console.log(
                        `PR #${pr.number} には @codereview メンションがあります。処理を開始します`
                      );

                      // 処理済みかチェック
                      if (processedPrNumbers.has(pr.number)) {
                        console.log(
                          `PR #${pr.number}は既に処理済みです。このPRの最初の@codereviewは処理済みのためスキップします`
                        );
                        skipped++;
                        continue; // 既に処理済みの場合はスキップ（修正箇所）

                        // 以下の再レビュー処理は不要なため削除または修正
                      } else {
                        // 新規レビュー作成
                        try {
                          // 既存のレビューを確認
                          const existingReview =
                            await this.reviewRepository.findOne({
                              where: {
                                backlog_pr_id: pr.number,
                                backlog_project: project.projectKey,
                                backlog_repository: repo.name,
                              },
                            });

                          if (existingReview) {
                            console.log(
                              `PR #${pr.number} には既にレビューが存在します。トラッカーを更新します`
                            );
                            // トラッカーを確実に記録
                            await this.markPullRequestAsProcessed(
                              project.projectKey,
                              repo.name,
                              pr.number,
                              existingReview.id
                            );
                            skipped++;
                            continue;
                          }

                          // 新規レビュー作成
                          console.log(
                            `PR #${pr.number} のレビューを作成します`
                          );
                          const review =
                            await this.automaticReviewCreator.createReviewFromPullRequest(
                              {
                                id: pr.id,
                                project: project.projectKey,
                                repository: repo.name,
                                number: pr.number,
                                summary: pr.summary,
                                description: prDetails.description || "",
                                base: pr.base,
                                branch: pr.branch,
                                authorId: pr.createdUser?.id,
                                authorName: pr.createdUser?.name,
                                authorMailAddress:
                                  pr.createdUser?.mailAddress || null,
                              }
                            );

                          // 処理済みとしてマーク
                          await this.markPullRequestAsProcessed(
                            project.projectKey,
                            repo.name,
                            pr.number,
                            review.id
                          );
                          processed++;
                        } catch (reviewError) {
                          console.error(
                            `PR #${pr.number} のレビュー作成中にエラーが発生しました:`,
                            reviewError
                          );
                          skipped++;
                        }
                      }
                    } else {
                      console.log(
                        `PR #${pr.number} には @codereview メンションがないためスキップします`
                      );
                      skipped++;
                    }
                  } catch (prError) {
                    console.error(
                      `PR #${pr.number} の処理中にエラーが発生しました:`,
                      prError
                    );
                    skipped++;
                  }
                }
              } catch (repoError) {
                console.error(
                  `リポジトリ「${repo.name}」の処理中にエラーが発生しました:`,
                  repoError
                );
              }
            }
          } else {
            console.log(
              `プロジェクト「${project.projectKey}」は対象外のためスキップします`
            );
          }
        } catch (projectError) {
          console.error(
            `プロジェクト「${project.projectKey}」の処理中にエラーが発生しました:`,
            projectError
          );
        }
      }
    } catch (error) {
      console.error(
        "既存プルリクエストのチェック中にエラーが発生しました:",
        error
      );
    }

    console.log(
      `プルリクエストチェック完了: ${processed}件処理, ${skipped}件スキップ`
    );
    return { processed, skipped };
  }

  /**
   * 単一のプルリクエストをチェック（webhook用）
   */
  async checkSinglePullRequest(
    projectKey: string,
    repoName: string,
    pullRequestId: number,
    commentId?: number
  ): Promise<boolean> {
    console.log(
      `単一のPR #${pullRequestId} (${projectKey}/${repoName}) をチェックします${
        commentId ? ` (コメントID: ${commentId})` : ""
      }`
    );

    try {
      // PR詳細取得
      const pr = await this.backlogService.getPullRequestById(
        projectKey,
        repoName,
        pullRequestId
      );

      // PRのステータスをチェック
      if (
        pr.status &&
        (pr.status.name === "Closed" || pr.status.name === "Merged")
      ) {
        console.log(
          `PR #${pullRequestId} は ${pr.status.name} 状態のためスキップします`
        );
        return false;
      }

      // @codereviewメンションをチェック（コメントIDがない場合はPR説明文をチェック）
      if (!commentId) {
        const hasMention = this.mentionDetectionService.detectCodeReviewMention(
          pr.description || ""
        );

        if (!hasMention) {
          console.log(
            `PR #${pullRequestId} には @codereview メンションがないためスキップします`
          );
          return false;
        }
      }

      // トラッカーを取得
      const tracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestId,
        },
      });

      console.log(`トラッカー: \n\n${JSON.stringify(tracker)}\n\n`);

      // コメントIDが指定されている場合、そのコメントが既に処理済みかチェック
      if (commentId) {
        // 処理済みコメントIDリストを取得
        const processedCommentIds = tracker
          ? JSON.parse(tracker.processed_comment_ids || "[]")
          : [];

        // 既に処理済みの場合はスキップ
        if (processedCommentIds.includes(commentId)) {
          console.log(
            `コメントID ${commentId} は既に処理済みのためスキップします`
          );
          return false;
        }
      }

      // 既存のレビューを取得
      const existingReview = await this.reviewRepository.findOne({
        where: {
          backlog_pr_id: pullRequestId,
          backlog_project: projectKey,
          backlog_repository: repoName,
        },
      });

      console.log(`既存のレビュー: \n\n${JSON.stringify(existingReview)}\n\n`);

      // PR コメント履歴とレビュー履歴を取得
      let comments = [];
      let reviewHistory = [];

      try {
        // コメント履歴の取得
        comments = await this.backlogService.getPullRequestComments(
          projectKey,
          repoName,
          pullRequestId
        );

        // レビュー履歴の取得
        if (tracker && tracker.review_history) {
          try {
            reviewHistory = JSON.parse(tracker.review_history);
          } catch (parseError) {
            console.warn(`レビュー履歴のパースエラー: ${parseError}`);
            reviewHistory = [];
          }
        }

        console.log(
          `コメント履歴: ${comments.length}件, レビュー履歴: ${reviewHistory.length}件`
        );
      } catch (historyError) {
        console.warn(`履歴取得エラー: ${historyError}`);
      }

      // レビュー作成 - 既存レビューがある場合は再レビューとして処理
      await this.automaticReviewCreator.createReviewFromPullRequest(
        {
          id: pr.id,
          project: projectKey,
          repository: repoName,
          number: pr.number,
          summary: pr.summary,
          description: pr.description || "",
          base: pr.base,
          branch: pr.branch,
          authorId: pr.createdUser?.id,
          authorName: pr.createdUser?.name,
          authorMailAddress: pr.createdUser?.mailAddress || null,
        },
        {
          isReReview: existingReview !== null, // 既存レビューがあれば再レビュー
          reviewHistory: reviewHistory,
          comments: comments,
          existingReviewId: existingReview?.id, // 既存レビューのIDを設定
          sourceCommentId: commentId,
        }
      );

      // 処理済みとしてマーク (コメントIDも渡す)
      await this.markPullRequestAsProcessed(
        projectKey,
        repoName,
        pullRequestId,
        existingReview?.id,
        comments,
        commentId // コメントIDを追加
      );

      return true;
    } catch (error) {
      console.error(
        `PR #${pullRequestId} のチェック中にエラーが発生しました:`,
        error
      );
      throw error;
    }
  }

  /**
   * プルリクエストが処理済みかチェック
   */
  private async isAlreadyProcessed(
    projectKey: string,
    repoName: string,
    pullRequestNumber: number
  ): Promise<boolean> {
    try {
      const tracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestNumber,
        },
      });

      return !!tracker;
    } catch (error) {
      console.error(
        `Error checking if PR #${pullRequestNumber} is processed:`,
        error
      );
      return false;
    }
  }

  // トラッカー更新メソッド
  private async markPullRequestAsProcessed(
    projectKey: string,
    repoName: string,
    pullRequestId: number,
    reviewId?: number,
    comments?: any[],
    processedCommentId?: number
  ): Promise<void> {
    try {
      console.log(
        `PR #${pullRequestId} を処理済みとしてマークします ${
          processedCommentId ? `(コメントID: ${processedCommentId})` : ""
        }`
      );

      // 既存のトラッカーを確認
      const existingTracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestId,
        },
      });

      const now = new Date();

      if (existingTracker) {
        console.log(
          `PR #${pullRequestId} は既に処理済みです。レビュー回数と履歴を更新します`
        );

        // レビュー履歴の更新
        let reviewHistory = [];
        if (existingTracker.review_history) {
          try {
            reviewHistory = JSON.parse(existingTracker.review_history);
          } catch (e) {
            console.error(
              "レビュー履歴のパースに失敗しました。新しい履歴を作成します"
            );
            reviewHistory = [];
          }
        }

        // 新しい履歴エントリを追加
        reviewHistory.push({
          review_id: reviewId,
          date: now.toISOString(),
          comments_count: comments?.length || 0,
          comment_id: processedCommentId, // 処理したコメントIDを履歴に追加
        });

        // 処理済みコメントIDリストを更新
        let processedCommentIds = [];
        try {
          processedCommentIds = JSON.parse(
            existingTracker.processed_comment_ids || "[]"
          );
        } catch (e) {
          console.error(
            "処理済みコメントIDのパースに失敗しました。新しいリストを作成します"
          );
          processedCommentIds = [];
        }

        // 新しいコメントIDを追加（あれば）
        if (
          processedCommentId &&
          !processedCommentIds.includes(processedCommentId)
        ) {
          processedCommentIds.push(processedCommentId);
          console.log(
            `コメントID ${processedCommentId} を処理済みリストに追加しました`
          );
        }

        // トラッカーを更新
        existingTracker.processed_at = now;
        existingTracker.last_review_at = now;
        existingTracker.review_count = existingTracker.review_count + 1;
        existingTracker.review_history = JSON.stringify(reviewHistory);
        existingTracker.processed_comment_ids =
          JSON.stringify(processedCommentIds);

        await this.pullRequestTrackerRepository.save(existingTracker);
        console.log(
          `PR #${pullRequestId} のトラッカーを更新しました。レビュー回数: ${existingTracker.review_count}`
        );
      } else {
        // 新しいトラッカーを作成
        const reviewHistory = reviewId
          ? [
              {
                review_id: reviewId,
                date: now.toISOString(),
                comments_count: comments?.length || 0,
                comment_id: processedCommentId, // 処理したコメントIDを履歴に追加
              },
            ]
          : [];

        // 処理済みコメントIDリスト初期化
        const processedCommentIds = processedCommentId
          ? [processedCommentId]
          : [];

        if (processedCommentId) {
          console.log(
            `新規作成: コメントID ${processedCommentId} を処理済みリストに追加しました`
          );
        }

        const tracker = new PullRequestTracker();
        tracker.project_key = projectKey;
        tracker.repository_name = repoName;
        tracker.pull_request_id = pullRequestId;
        tracker.processed_at = now;
        tracker.last_review_at = now;
        tracker.review_count = 1;
        tracker.review_history = JSON.stringify(reviewHistory);
        tracker.processed_comment_ids = JSON.stringify(processedCommentIds);

        const savedTracker = await this.pullRequestTrackerRepository.save(
          tracker
        );
        console.log(
          `PR #${pullRequestId} を処理済みとしてマークしました。トラッカーID: ${savedTracker.id}`
        );
      }
    } catch (error) {
      console.error(
        `PR #${pullRequestId} を処理済みとしてマーク中にエラーが発生しました:`,
        error
      );
      throw error;
    }
  }

  /**
   * プルリクエストの過去レビュー履歴を取得
   */
  async getPullRequestReviewHistory(
    projectKey: string,
    repoName: string,
    pullRequestId: number
  ): Promise<any> {
    try {
      console.log(`PR #${pullRequestId} のレビュー履歴を取得します`);

      const tracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestId,
        },
      });

      if (!tracker || !tracker.review_history) {
        console.log(`PR #${pullRequestId} のレビュー履歴が見つかりません`);
        return null;
      }

      try {
        const history = JSON.parse(tracker.review_history);
        console.log(
          `PR #${pullRequestId} のレビュー履歴を取得しました: ${history.length}件`
        );
        return {
          count: tracker.review_count,
          lastReviewAt: tracker.last_review_at,
          history,
        };
      } catch (e) {
        console.error("レビュー履歴のパースに失敗しました:", e);
        return null;
      }
    } catch (error) {
      console.error(`レビュー履歴取得中にエラーが発生しました:`, error);
      return null;
    }
  }
}
