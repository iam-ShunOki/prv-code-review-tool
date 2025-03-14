// src/services/PullRequestMonitoringService.ts
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
    console.log("Checking existing pull requests...");
    let processed = 0;
    let skipped = 0;

    try {
      // プロジェクト一覧を取得
      const projects = await this.backlogService.getProjects();
      console.log(`Found ${projects.length} projects`);

      for (const project of projects) {
        console.log(`Checking project: ${project.projectKey}`);

        try {
          // 特定のプロジェクトのみ処理する
          if (project.projectKey == "AD_TECHNOLOGY") {
            const repositories = await this.backlogService.getRepositories(
              project.projectKey
            );
            console.log(
              `Found ${repositories.length} repositories in project ${project.projectKey}`
            );

            for (const repo of repositories) {
              console.log(`Checking repository: ${repo.name}`);

              try {
                // オープン状態のプルリクエスト一覧を取得
                const pullRequests = await this.backlogService.getPullRequests(
                  project.projectKey,
                  repo.name,
                  "open"
                );

                console.log(
                  `Found ${pullRequests.length} open pull requests in ${repo.name}`
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
                  `Already processed ${processedPrNumbers.size} PRs in this repo`
                );

                for (const pr of pullRequests) {
                  console.log(`Checking PR #${pr.number} (${pr.summary})`);

                  // 処理済みかチェック - 効率的なSet検索
                  if (processedPrNumbers.has(pr.number)) {
                    console.log(`PR #${pr.number} already processed, skipping`);
                    skipped++;
                    continue;
                  }

                  try {
                    // PR詳細を取得
                    const prDetails =
                      await this.backlogService.getPullRequestById(
                        project.projectKey,
                        repo.name,
                        pr.number
                      );

                    // PR詳細をログに出力
                    console.log(
                      `PR #${pr.number} details:`,
                      JSON.stringify(prDetails, null, 2)
                    );

                    // @codereviewメンションをチェック
                    const hasMention =
                      this.mentionDetectionService.detectCodeReviewMention(
                        prDetails.description || ""
                      );

                    if (hasMention) {
                      console.log(
                        `PR #${pr.number} has @codereview mention, processing`
                      );

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
                            `Review already exists for PR #${pr.number}, updating tracker`
                          );
                          // トラッカーを確実に記録
                          await this.markPullRequestAsProcessed(
                            project.projectKey,
                            repo.name,
                            pr.number
                          );
                          skipped++;
                          continue;
                        }

                        // レビュー作成
                        console.log(`Creating review for PR #${pr.number}`);
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
                          pr.number
                        );
                        processed++;
                      } catch (reviewError) {
                        console.error(
                          `Error creating review for PR #${pr.number}:`,
                          reviewError
                        );
                        skipped++;
                      }
                    } else {
                      console.log(
                        `PR #${pr.number} has no @codereview mention, skipping`
                      );
                      skipped++;
                    }
                  } catch (prError) {
                    console.error(
                      `Error processing PR #${pr.number}:`,
                      prError
                    );
                    skipped++;
                  }
                }
              } catch (repoError) {
                console.error(
                  `Error processing repository ${repo.name}:`,
                  repoError
                );
              }
            }
          } else {
            console.log(
              `Skipping project ${project.projectKey} (not in target list)`
            );
          }
        } catch (projectError) {
          console.error(
            `Error processing project ${project.projectKey}:`,
            projectError
          );
        }
      }
    } catch (error) {
      console.error("Error checking existing pull requests:", error);
    }

    console.log(
      `Pull request check completed: ${processed} processed, ${skipped} skipped`
    );
    return { processed, skipped };
  }

  /**
   * 単一のプルリクエストをチェック（webhook用）
   */
  async checkSinglePullRequest(
    projectKey: string,
    repoName: string,
    pullRequestId: number
  ): Promise<boolean> {
    console.log(
      `Checking single PR #${pullRequestId} in ${projectKey}/${repoName}`
    );

    try {
      // 処理済みかチェック
      const isProcessed = await this.isAlreadyProcessed(
        projectKey,
        repoName,
        pullRequestId
      );

      if (isProcessed) {
        console.log(`PR #${pullRequestId} already processed, skipping`);
        return false;
      }

      // PR詳細取得
      const pr = await this.backlogService.getPullRequestById(
        projectKey,
        repoName,
        pullRequestId
      );

      // @codereviewメンションをチェック
      const hasMention = this.mentionDetectionService.detectCodeReviewMention(
        pr.description || ""
      );

      if (!hasMention) {
        console.log(
          `PR #${pullRequestId} has no @codereview mention, skipping`
        );
        return false;
      }

      console.log(
        `PR #${pullRequestId} has @codereview mention, creating review`
      );

      // レビュー作成
      await this.automaticReviewCreator.createReviewFromPullRequest({
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
      });

      // 処理済みとしてマーク
      await this.markPullRequestAsProcessed(
        projectKey,
        repoName,
        pullRequestId
      );

      return true;
    } catch (error) {
      console.error(`Error checking PR #${pullRequestId}:`, error);
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
   */
  private async markPullRequestAsProcessed(
    projectKey: string,
    repoName: string,
    pullRequestNumber: number
  ): Promise<void> {
    try {
      console.log(`Marking PR #${pullRequestNumber} as processed`);

      // 既存のトラッカーを確認
      const existingTracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repoName,
          pull_request_id: pullRequestNumber,
        },
      });

      if (existingTracker) {
        console.log(
          `PR #${pullRequestNumber} already marked as processed, updating timestamp`
        );
        existingTracker.processed_at = new Date();
        await this.pullRequestTrackerRepository.save(existingTracker);
        return;
      }

      // 新しいトラッカーを作成
      const tracker = new PullRequestTracker();
      tracker.project_key = projectKey;
      tracker.repository_name = repoName;
      tracker.pull_request_id = pullRequestNumber;
      tracker.processed_at = new Date();

      const savedTracker = await this.pullRequestTrackerRepository.save(
        tracker
      );
      console.log(
        `PR #${pullRequestNumber} marked as processed, tracker ID: ${savedTracker.id}`
      );

      // 保存の検証
      const verifyTracker = await this.pullRequestTrackerRepository.findOne({
        where: {
          id: savedTracker.id,
        },
      });

      if (!verifyTracker) {
        console.error(
          `CRITICAL: Failed to save tracker for PR #${pullRequestNumber}!`
        );
        throw new Error(`Failed to save tracker for PR #${pullRequestNumber}`);
      }
    } catch (error) {
      console.error(
        `Error marking PR #${pullRequestNumber} as processed:`,
        error
      );
      throw error;
    }
  }
}
