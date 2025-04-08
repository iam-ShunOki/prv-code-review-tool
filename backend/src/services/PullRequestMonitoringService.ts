// backend/src/services/PullRequestMonitoringService.ts
import { BacklogService } from "./BacklogService";
import { MentionDetectionService } from "./MentionDetectionService";
import { AutomaticReviewCreator } from "./AutomaticReviewCreator";
import { AppDataSource } from "../index";
import { PullRequestTracker } from "../models/PullRequestTracker";
import { Review } from "../models/Review";
import { In, Repository } from "typeorm";
import { SubmissionService } from "./SubmissionService";
import { FeedbackService } from "./FeedbackService";
import { Feedback } from "../models/Feedback";

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
   * レビュー履歴からチェックリスト進捗情報を取得
   */
  private async getChecklistProgress(
    projectKey: string,
    repoName: string,
    pullRequestId: number
  ): Promise<{
    reviewCount: number;
    lastReviewId?: number;
    checklistRate?: { total: number; checked: number; rate: number };
    previousFeedbacks?: Feedback[];
  }> {
    try {
      console.log(`PR #${pullRequestId} のチェックリスト進捗情報を取得します`);

      // トラッカーを取得
      const tracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestId,
        },
      });

      if (!tracker || !tracker.review_history) {
        console.log(`PR #${pullRequestId} のレビュー履歴が見つかりません`);
        return { reviewCount: 0 };
      }

      // レビュー履歴をパース
      let reviewHistory: any[] = [];
      try {
        reviewHistory = JSON.parse(tracker.review_history);
      } catch (e) {
        console.error("レビュー履歴のパースに失敗しました:", e);
        return { reviewCount: tracker.review_count || 0 };
      }

      if (reviewHistory.length === 0) {
        return { reviewCount: 0 };
      }

      // 最新のレビューエントリを取得
      const lastReviewEntry = reviewHistory[reviewHistory.length - 1];
      const lastReviewId = lastReviewEntry?.review_id;

      if (!lastReviewId) {
        return { reviewCount: reviewHistory.length };
      }

      // 最新のレビューIDからフィードバック情報を取得
      try {
        // 最新の提出を取得
        const submissionService = new SubmissionService();
        const lastSubmission =
          await submissionService.getLatestSubmissionByReviewId(lastReviewId);

        if (!lastSubmission) {
          return { reviewCount: reviewHistory.length, lastReviewId };
        }

        // フィードバックとチェックリスト状態を取得
        const feedbackService = new FeedbackService();
        const previousFeedbacks =
          await feedbackService.getFeedbacksBySubmissionId(lastSubmission.id);
        const checklistRate = await feedbackService.getChecklistRate(
          lastSubmission.id
        );

        console.log(
          `PR #${pullRequestId} のチェックリスト進捗: ${
            checklistRate.checked
          }/${checklistRate.total} (${checklistRate.rate.toFixed(1)}%)`
        );

        return {
          reviewCount: reviewHistory.length,
          lastReviewId,
          checklistRate,
          previousFeedbacks,
        };
      } catch (error) {
        console.error(`フィードバック情報取得エラー:`, error);
        return { reviewCount: reviewHistory.length, lastReviewId };
      }
    } catch (error) {
      console.error(`チェックリスト進捗情報取得エラー:`, error);
      return { reviewCount: 0 };
    }
  }

  /**
   * 単一のプルリクエストをチェック（webhook用）
   * - PR更新検出機能追加
   * - 最新コードに対するレビュー機能強化
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

      // コメント履歴を取得
      const comments = await this.backlogService.getPullRequestComments(
        projectKey,
        repoName,
        pullRequestId,
        { order: "asc" } // 古い順に取得して処理
      );

      console.log(
        `PR #${pullRequestId} のコメント ${comments.length} 件を取得しました`
      );

      // トラッカーを取得または作成
      let tracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestId,
        },
      });

      if (!tracker) {
        tracker = new PullRequestTracker();
        tracker.project_key = projectKey;
        tracker.repository_name = repoName;
        tracker.pull_request_id = pullRequestId;
        tracker.processed_at = new Date();
        tracker.review_count = 0;
        tracker.processed_comment_ids = "[]";
        tracker.description_processed = false;
        tracker = await this.pullRequestTrackerRepository.save(tracker);
      }

      // 処理済みコメントID一覧を取得
      let processedCommentIds: number[] = [];
      try {
        processedCommentIds = JSON.parse(tracker.processed_comment_ids || "[]");
      } catch (e) {
        console.error("処理済みコメントIDのパースに失敗しました:", e);
        processedCommentIds = [];
      }

      console.log(`処理済みコメントID: ${processedCommentIds.join(", ")}`);

      // @codereviewメンションのあるコメントをフィルタリング
      const codeReviewComments = comments.filter((comment) =>
        this.mentionDetectionService.detectCodeReviewMention(
          comment.content || ""
        )
      );

      console.log(
        `@codereview メンションのあるコメント: ${codeReviewComments.length} 件`
      );

      // AIからのレスポンスコメントをフィルタリング
      const aiResponseComments = comments.filter((comment) =>
        (comment.content || "").includes("AIコードレビュー結果")
      );

      console.log(`AIレスポンスコメント: ${aiResponseComments.length} 件`);

      // PR説明文のメンションチェック
      const hasMentionInDescription =
        pr.description &&
        this.mentionDetectionService.detectCodeReviewMention(pr.description);

      // PR更新検出（新機能）
      let prUpdated = false;
      if (tracker && tracker.last_review_at) {
        // PR更新日時を取得（APIによって形式が異なる場合があるため安全に処理）
        const prUpdatedAt = pr.updated
          ? new Date(pr.updated)
          : pr.updatedAt
          ? new Date(pr.updatedAt)
          : new Date();

        const lastReviewAt = new Date(tracker.last_review_at);

        console.log(`PRの最終更新日時: ${prUpdatedAt.toISOString()}`);
        console.log(`最終レビュー日時: ${lastReviewAt.toISOString()}`);

        // PR更新日時が最終レビュー日時より後の場合は再レビュー
        if (prUpdatedAt > lastReviewAt) {
          console.log(
            `PR #${pullRequestId} は最後のレビュー以降に更新されています`
          );
          prUpdated = true;
        }
      }

      // 説明文チェック用の変数
      let isDescriptionRequest = false;

      // 特定のコメントIDが指定されている場合
      if (commentId) {
        // 指定されたコメントが@codereviewを含むか確認
        const targetComment = comments.find((c) => c.id === commentId);
        if (
          !targetComment ||
          !this.mentionDetectionService.detectCodeReviewMention(
            targetComment.content || ""
          )
        ) {
          console.log(
            `コメントID ${commentId} に @codereview メンションがないためスキップします`
          );
          return false;
        }

        // 既に処理済みか確認
        if (processedCommentIds.includes(commentId)) {
          console.log(
            `コメントID ${commentId} は既に処理済みのためスキップします`
          );
          return false;
        }
      }
      // コメントIDが指定されていない場合（システム起動時や定期チェック時）
      else {
        // PRに更新があり、新しいコミットがある場合を追加（新機能）
        if (prUpdated) {
          console.log(
            `PR #${pullRequestId} に更新があったため、再レビューを実行します`
          );
          // この場合、以下の条件をスキップして直接レビュー実行に進む
        }
        // PR説明文に@codereviewがあり、まだ処理していない場合
        else if (hasMentionInDescription && !tracker.description_processed) {
          console.log(
            `PR #${pullRequestId} の説明文に未処理の @codereview メンションがあります`
          );
          isDescriptionRequest = true;
        }
        // それ以外の場合は@codereviewコメントとレスポンスの数を比較
        else if (hasMentionInDescription && tracker.description_processed) {
          console.log(
            `PR #${pullRequestId} の説明文の @codereview は既に処理済みです`
          );

          // 未処理のコメント@codereviewがあるか確認
          const unprocessedComments = codeReviewComments.filter(
            (comment) => !processedCommentIds.includes(comment.id)
          );

          if (unprocessedComments.length === 0 && !prUpdated) {
            console.log(
              "未処理の @codereview コメントがなく、PR更新もないためスキップします"
            );
            return false;
          }

          // 最新の未処理コメントを選択
          if (unprocessedComments.length > 0) {
            const latestComment =
              unprocessedComments[unprocessedComments.length - 1];
            commentId = latestComment.id;
            console.log(
              `最新の未処理コメントID ${commentId} に対するレビューを生成します`
            );
          }
        }
        // 説明文に@codereviewがなく、コメントのみの場合
        else {
          // 未処理の@codereviewコメントがあるか確認
          const unprocessedComments = codeReviewComments.filter(
            (comment) => !processedCommentIds.includes(comment.id)
          );

          if (unprocessedComments.length === 0 && !prUpdated) {
            console.log(
              "未処理の @codereview コメントがなく、PR更新もないためスキップします"
            );
            return false;
          }

          // 最新の未処理コメントを選択
          if (unprocessedComments.length > 0) {
            const latestComment =
              unprocessedComments[unprocessedComments.length - 1];
            commentId = latestComment.id;
            console.log(
              `最新の未処理コメントID ${commentId} に対するレビューを生成します`
            );
          }
        }
      }

      // チェックリスト進捗情報の取得
      const progressInfo = await this.getChecklistProgress(
        projectKey,
        repoName,
        pullRequestId
      );

      console.log(
        `PR #${pullRequestId} のレビュー回数: ${progressInfo.reviewCount}${
          progressInfo.checklistRate
            ? `, チェックリスト進捗: ${progressInfo.checklistRate.rate.toFixed(
                1
              )}%`
            : ""
        }`
      );

      // 既存のレビューを取得
      const existingReview = await this.reviewRepository.findOne({
        where: {
          backlog_pr_id: pullRequestId,
          backlog_project: projectKey,
          backlog_repository: repoName,
        },
      });

      // レビュー履歴とコメント履歴を構築
      let reviewHistory = [];
      if (tracker && tracker.review_history) {
        try {
          reviewHistory = JSON.parse(tracker.review_history);
        } catch (parseError) {
          console.warn("レビュー履歴のパースエラー:", parseError);
        }
      }

      // コンテキスト情報の構築（PR更新情報を追加）
      const context = {
        isReReview: existingReview !== null || prUpdated, // PR更新でも再レビューとみなす
        reviewHistory: reviewHistory,
        comments: comments,
        existingReviewId: existingReview?.id,
        sourceCommentId: commentId,
        isDescriptionRequest: isDescriptionRequest,
        checklistProgress: progressInfo.checklistRate?.rate || 0,
        previousFeedbacks: progressInfo.previousFeedbacks,
        isPrUpdate: prUpdated, // PR更新情報をコンテキストに追加
      };

      // レビュー作成および実行
      await this.automaticReviewCreator.createReviewFromPullRequest(
        {
          id: pr.id,
          project: projectKey,
          repository: repoName,
          number: pullRequestId,
          summary: pr.summary,
          description: pr.description || "",
          base: pr.base,
          branch: pr.branch,
          authorId: pr.createdUser?.id,
          authorName: pr.createdUser?.name,
          authorMailAddress: pr.createdUser?.mailAddress || null,
        },
        context
      );

      // 処理済みとしてマーク
      await this.markPullRequestAsProcessed(
        projectKey,
        repoName,
        pullRequestId,
        existingReview?.id,
        comments,
        commentId,
        isDescriptionRequest // 説明文処理フラグを渡す
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

  /**
   * プルリクエストを処理済みとしてマーク
   * 改善: 説明文処理フラグを追加
   */
  private async markPullRequestAsProcessed(
    projectKey: string,
    repoName: string,
    pullRequestId: number,
    reviewId?: number,
    comments?: any[],
    processedCommentId?: number,
    isDescriptionProcessed?: boolean // 新規パラメータ
  ): Promise<void> {
    try {
      console.log(
        `PR #${pullRequestId} を処理済みとしてマークします ${
          processedCommentId ? `(コメントID: ${processedCommentId})` : ""
        }${isDescriptionProcessed ? " (説明文処理)" : ""}`
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
          is_description_request: isDescriptionProcessed, // 説明文からのリクエストかどうか
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

        // 説明文処理フラグを更新
        if (isDescriptionProcessed) {
          existingTracker.description_processed = true;
          console.log(
            `PR #${pullRequestId} の説明文を処理済みとしてマークしました`
          );
        }

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
                comment_id: processedCommentId,
                is_description_request: isDescriptionProcessed,
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
        tracker.description_processed = isDescriptionProcessed || false;

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
