// backend/src/services/AutomaticReviewCreator.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { User, UserRole } from "../models/User";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { CodeEmbeddingService } from "./CodeEmbeddingService";
import { BacklogService } from "./BacklogService";
import { ReviewQueueService } from "./ReviewQueueService";

interface PullRequestData {
  id: number;
  project: string;
  repository: string;
  number: number;
  summary: string;
  description: string;
  base: string;
  branch: string;
  authorId?: number;
  authorName?: string;
  authorMailAddress?: string | null;
}

export class AutomaticReviewCreator {
  private reviewRepository = AppDataSource.getRepository(Review);
  private userRepository = AppDataSource.getRepository(User);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private codeEmbeddingService: CodeEmbeddingService;
  private backlogService: BacklogService;

  constructor() {
    this.codeEmbeddingService = new CodeEmbeddingService();
    this.backlogService = new BacklogService();
  }

  /**
   * プルリクエストからコードレビューを作成
   */
  async createReviewFromPullRequest(prData: PullRequestData): Promise<Review> {
    console.log(`Creating review from PR #${prData.number}: ${prData.summary}`);

    try {
      // ユーザーを特定または作成
      let user: User;

      if (prData.authorMailAddress) {
        // メールアドレスでユーザーを検索
        user = await this.findOrCreateUser(
          prData.authorMailAddress,
          prData.authorName || prData.authorMailAddress.split("@")[0]
        );
      } else {
        // メールアドレスがない場合はBaclogユーザーIDに基づく仮メールを作成
        const backlogUserId = prData.authorId || 0;
        const backlogUserEmail = `backlog_${backlogUserId}@example.com`;
        user = await this.findOrCreateUser(
          backlogUserEmail,
          prData.authorName || `Backlog User ${backlogUserId}`
        );
      }

      // レビューを作成
      const review = new Review();
      review.user_id = user.id;
      review.title = `PR #${prData.number}: ${prData.summary}`;
      review.description = `Backlogプルリクエストから自動作成されたレビュー\n\n${prData.description}\n\nProject: ${prData.project}\nRepository: ${prData.repository}\nBranch: ${prData.branch}`;
      review.status = ReviewStatus.PENDING;
      review.backlog_pr_id = prData.id;
      review.backlog_project = prData.project;
      review.backlog_repository = prData.repository;

      const savedReview = await this.reviewRepository.save(review);
      console.log(`Created review #${savedReview.id} for PR #${prData.number}`);

      // リポジトリをクローン
      let tempRepoDir = "";
      try {
        tempRepoDir = await this.backlogService.cloneRepository(
          prData.project,
          prData.repository,
          prData.base
        );
        console.log(`Cloned repository to ${tempRepoDir}`);

        // 差分を取得
        const diffContent = await this.backlogService.getPullRequestDiff(
          prData.project,
          prData.repository,
          prData.id
        );

        // 差分からコード内容を抽出（具体的な実装は、Backlog APIの仕様に応じて変更が必要）
        const codeContent = this.extractCodeFromDiff(diffContent);

        // コード提出を作成
        const submission = new CodeSubmission();
        submission.review_id = savedReview.id;
        submission.code_content = codeContent;
        submission.expectation = `Backlogプルリクエスト #${prData.number} (${prData.project}/${prData.repository}) から自動作成されました。`;
        submission.status = SubmissionStatus.SUBMITTED;
        submission.version = 1;

        const savedSubmission = await this.submissionRepository.save(
          submission
        );
        console.log(
          `Created submission #${savedSubmission.id} for review #${savedReview.id}`
        );

        // AIレビューキューに追加
        await ReviewQueueService.getInstance().addToQueue(savedSubmission.id);
        console.log(`Added submission #${savedSubmission.id} to review queue`);

        // レビューのステータスを更新
        await this.reviewRepository.update(savedReview.id, {
          status: ReviewStatus.IN_PROGRESS,
        });

        return savedReview;
      } finally {
        // 一時ディレクトリをクリーンアップ
        if (tempRepoDir) {
          await this.backlogService.cleanupRepository(tempRepoDir);
        }
      }
    } catch (error) {
      console.error("Error creating review from pull request:", error);
      throw error;
    }
  }

  /**
   * ユーザーを検索または作成
   */
  private async findOrCreateUser(email: string, name: string): Promise<User> {
    // メールアドレスでユーザーを検索
    let user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      // ユーザーが存在しない場合は新規作成
      console.log(`Creating new user: ${name} (${email})`);
      user = new User();
      user.name = name;
      user.email = email;
      user.password = Math.random().toString(36).substring(2, 10); // ランダムパスワード
      user.role = UserRole.TRAINEE;
      user = await this.userRepository.save(user);
    }

    return user;
  }

  /**
   * 差分からコード内容を抽出（具体的な実装はBacklog APIの仕様に応じて調整）
   */
  private extractCodeFromDiff(diffContent: any): string {
    // 注: この実装はBacklog APIの仕様に応じて調整が必要です
    // 差分情報から変更内容を文字列形式で返す仮の実装

    if (typeof diffContent === "string") {
      return diffContent;
    }

    if (Array.isArray(diffContent)) {
      return diffContent
        .map((diff) => {
          if (typeof diff === "string") {
            return diff;
          }
          return JSON.stringify(diff, null, 2);
        })
        .join("\n\n");
    }

    // オブジェクト形式の場合は整形して返す
    return JSON.stringify(diffContent, null, 2);
  }
}
