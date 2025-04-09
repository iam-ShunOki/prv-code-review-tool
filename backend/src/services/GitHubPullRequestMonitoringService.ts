import { AppDataSource } from "../index";
import { GitHubRepository } from "../models/GitHubRepository";
import { GitHubPullRequestTracker } from "../models/GitHubPullRequestTracker";
import { GitHubService } from "./GitHubService";
import { MentionDetectionService } from "./MentionDetectionService";

export class GitHubPullRequestMonitoringService {
  private githubService: GitHubService;
  private mentionDetectionService: MentionDetectionService;
  private githubRepositoryRepository =
    AppDataSource.getRepository(GitHubRepository);
  private trackerRepository = AppDataSource.getRepository(
    GitHubPullRequestTracker
  );

  constructor() {
    this.githubService = new GitHubService();
    this.mentionDetectionService = new MentionDetectionService();
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

          // TODO: 実際のPR処理を実装
          // この部分はAPIリクエストが必要なため、フレームワークの実装とします
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

  // 他のメソッドも実装予定
}
