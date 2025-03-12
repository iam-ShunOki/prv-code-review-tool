// backend/src/services/PullRequestMonitoringService.ts
import { BacklogService } from "./BacklogService";
import { MentionDetectionService } from "./MentionDetectionService";
import { AutomaticReviewCreator } from "./AutomaticReviewCreator";
import { AppDataSource } from "../index";
import { PullRequestTracker } from "../models/PullRequestTracker";

export class PullRequestMonitoringService {
  private backlogService: BacklogService;
  private mentionDetectionService: MentionDetectionService;
  private automaticReviewCreator: AutomaticReviewCreator;
  private pullRequestTrackerRepository =
    AppDataSource.getRepository(PullRequestTracker);

  constructor() {
    this.backlogService = new BacklogService();
    this.mentionDetectionService = new MentionDetectionService();
    this.automaticReviewCreator = new AutomaticReviewCreator();
  }

  /**
   * アプリケーション起動時に既存のプルリクエストをチェック
   */
  async checkExistingPullRequests(): Promise<{
    processed: number;
    skipped: number;
  }> {
    console.log("Checking existing pull requests...");
    const projects = await this.backlogService.getProjects();
    let processed = 0;
    let skipped = 0;

    for (const project of projects) {
      console.log(`Checking project: ${project.projectKey}`);
      const repositories = await this.backlogService.getRepositories(
        project.projectKey
      );

      for (const repo of repositories) {
        console.log(`Checking repository: ${repo.name}`);
        // オープン状態のプルリクエストを取得
        const pullRequests = await this.backlogService.getPullRequests(
          project.projectKey,
          repo.name,
          "open"
        );

        console.log(
          `Found ${pullRequests.length} open pull requests in ${repo.name}`
        );

        for (const pr of pullRequests) {
          // すでに処理済みかチェック
          const existing = await this.pullRequestTrackerRepository.findOne({
            where: {
              project_key: project.projectKey,
              repository_name: repo.name,
              pull_request_id: pr.id,
            },
          });

          if (existing) {
            console.log(`Skipping already processed PR #${pr.number}`);
            skipped++;
            continue;
          }

          // プルリクエストの詳細を取得
          const prDetails = await this.backlogService.getPullRequestById(
            project.projectKey,
            repo.name,
            pr.id
          );

          // @codereviewメンションをチェック
          const hasMention =
            this.mentionDetectionService.detectCodeReviewMention(
              prDetails.description
            );

          if (hasMention) {
            console.log(`Processing PR #${pr.number} with @codereview mention`);
            // コードレビューを作成
            await this.automaticReviewCreator.createReviewFromPullRequest({
              id: pr.id,
              project: project.projectKey,
              repository: repo.name,
              number: pr.number,
              summary: pr.summary,
              description: prDetails.description,
              base: pr.base,
              branch: pr.branch,
              authorId: pr.createdUser.id,
              authorName: pr.createdUser.name,
              authorMailAddress: pr.createdUser.mailAddress || null,
            });

            // 処理済みとして記録
            const tracker = new PullRequestTracker();
            tracker.project_key = project.projectKey;
            tracker.repository_name = repo.name;
            tracker.pull_request_id = pr.id;
            tracker.processed_at = new Date();
            await this.pullRequestTrackerRepository.save(tracker);

            processed++;
          } else {
            console.log(
              `Skipping PR #${pr.number} without @codereview mention`
            );
            skipped++;
          }
        }
      }
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
    // すでに処理済みかチェック
    const existing = await this.pullRequestTrackerRepository.findOne({
      where: {
        project_key: projectKey,
        repository_name: repoName,
        pull_request_id: pullRequestId,
      },
    });

    if (existing) {
      console.log(
        `Pull request already processed: ${projectKey}/${repoName}#${pullRequestId}`
      );
      return false;
    }

    try {
      // プルリクエストの詳細を取得
      const pr = await this.backlogService.getPullRequestById(
        projectKey,
        repoName,
        pullRequestId
      );

      // @codereviewメンションをチェック
      const hasMention = this.mentionDetectionService.detectCodeReviewMention(
        pr.description
      );

      if (hasMention) {
        console.log(
          `Processing pull request with @codereview mention: ${projectKey}/${repoName}#${pullRequestId}`
        );
        // コードレビューを作成
        await this.automaticReviewCreator.createReviewFromPullRequest({
          id: pr.id,
          project: projectKey,
          repository: repoName,
          number: pr.number,
          summary: pr.summary,
          description: pr.description,
          base: pr.base,
          branch: pr.branch,
          authorId: pr.createdUser.id,
          authorName: pr.createdUser.name,
          authorMailAddress: pr.createdUser.mailAddress || null,
        });

        // 処理済みとして記録
        const tracker = new PullRequestTracker();
        tracker.project_key = projectKey;
        tracker.repository_name = repoName;
        tracker.pull_request_id = pullRequestId;
        tracker.processed_at = new Date();
        await this.pullRequestTrackerRepository.save(tracker);

        return true;
      } else {
        console.log(
          `Skipping pull request without @codereview mention: ${projectKey}/${repoName}#${pullRequestId}`
        );
        return false;
      }
    } catch (error) {
      console.error("Error checking pull request:", error);
      throw error;
    }
  }
}
