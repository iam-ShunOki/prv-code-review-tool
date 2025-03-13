// src/services/AutomaticReviewCreator.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { User, UserRole } from "../models/User";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { BacklogService } from "./BacklogService";
import { ReviewQueueService } from "./ReviewQueueService";
import { SubmissionService } from "./SubmissionService";
import { EntityManager, Repository } from "typeorm";

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
  private reviewRepository: Repository<Review>;
  private userRepository: Repository<User>;
  private submissionRepository: Repository<CodeSubmission>;
  private backlogService: BacklogService;
  private submissionService: SubmissionService;

  constructor() {
    this.reviewRepository = AppDataSource.getRepository(Review);
    this.userRepository = AppDataSource.getRepository(User);
    this.submissionRepository = AppDataSource.getRepository(CodeSubmission);
    this.backlogService = new BacklogService();
    this.submissionService = new SubmissionService();
  }

  /**
   * プルリクエストからレビューを作成
   */
  async createReviewFromPullRequest(prData: PullRequestData): Promise<Review> {
    console.log(
      `Creating review from PR #${prData.number} (id: ${prData.id}): ${prData.summary}`
    );

    let tempRepoDir = "";
    let cleanupTimer: NodeJS.Timeout | null = null;

    try {
      // 既存のレビューがあるか確認
      const existingReview = await this.reviewRepository.findOne({
        where: {
          backlog_pr_id: prData.number,
          backlog_project: prData.project,
          backlog_repository: prData.repository,
        },
      });

      if (existingReview) {
        console.log(
          `Review already exists for PR #${prData.number}: review ID #${existingReview.id}`
        );
        return existingReview;
      }

      // ユーザーを見つけるか作成
      const user = await this.findOrCreateUser(prData);
      console.log(`Using user ${user.name} (${user.email}) with ID ${user.id}`);

      // レビューを作成
      const review = new Review();
      review.user_id = user.id;
      review.title = `PR #${prData.number}: ${prData.summary}`;
      review.description = `Backlogプルリクエストから自動作成されたレビュー\n\n${prData.description}\n\nProject: ${prData.project}\nRepository: ${prData.repository}\nBranch: ${prData.branch}`;
      review.status = ReviewStatus.PENDING;
      review.backlog_pr_id = prData.number;
      review.backlog_project = prData.project;
      review.backlog_repository = prData.repository;

      const savedReview = await this.reviewRepository.save(review);
      console.log(`Created review #${savedReview.id} for PR #${prData.number}`);

      // コード取得とコード提出作成
      let codeContent = "";
      let submissionId: number | null = null;

      try {
        // 自動クリーンアップタイマー設定（10分後）
        cleanupTimer = setTimeout(async () => {
          if (tempRepoDir) {
            console.log(`Cleanup timer triggered for ${tempRepoDir}`);
            try {
              await this.backlogService.cleanupRepository(tempRepoDir);
              tempRepoDir = ""; // クリーンアップ後は空文字列に設定
            } catch (timeoutError) {
              console.error(`Error in cleanup timeout:`, timeoutError);
            }
          }
        }, 10 * 60 * 1000);

        // リポジトリをクローン
        tempRepoDir = await this.backlogService.cloneRepository(
          prData.project,
          prData.repository,
          prData.base
        );
        console.log(`Cloned repository to ${tempRepoDir}`);

        // 差分を取得
        const diffData = await this.backlogService.getPullRequestDiff(
          prData.project,
          prData.repository,
          prData.number
        );

        // 差分からコード内容を抽出
        codeContent = this.extractCodeFromDiff(diffData);
        console.log(
          `Extracted code content (${codeContent.length} characters)`
        );

        // タイマーをクリア
        if (cleanupTimer) {
          clearTimeout(cleanupTimer);
          cleanupTimer = null;
        }

        // クローンしたリポジトリをクリーンアップ
        if (tempRepoDir) {
          try {
            await this.backlogService.cleanupRepository(tempRepoDir);
            console.log(`Cleaned up repository at ${tempRepoDir}`);
            tempRepoDir = ""; // クリーンアップ後は空文字列に設定
          } catch (cleanupError) {
            console.error(`Error cleaning up repository:`, cleanupError);
            // エラーがあっても処理を継続
          }
        }
      } catch (codeError) {
        console.error(
          `Error retrieving code for PR #${prData.number}:`,
          codeError
        );
        codeContent = `// エラーが発生したため、コードを取得できませんでした。\n// ${
          codeError instanceof Error ? codeError.message : String(codeError)
        }\n\n// PR情報:\n// タイトル: ${prData.summary}\n// 説明: ${
          prData.description
        }`;
      }

      // トランザクション内でコード提出を作成
      try {
        submissionId = await AppDataSource.transaction(async (manager) => {
          // コード提出を作成
          const submission = new CodeSubmission();
          submission.review_id = savedReview.id;
          submission.code_content =
            codeContent ||
            `// No code content available for PR #${prData.number}`;
          submission.expectation = `Backlogプルリクエスト #${prData.number} (${prData.project}/${prData.repository}) から自動作成されました。`;
          submission.status = SubmissionStatus.SUBMITTED;
          submission.version = 1;

          // トランザクション内でコード提出を保存
          const savedSubmission = await manager.save(
            CodeSubmission,
            submission
          );
          console.log(
            `Created submission #${savedSubmission.id} for review #${savedReview.id}`
          );

          // レビューのステータスを更新
          savedReview.status = ReviewStatus.IN_PROGRESS;
          await manager.save(Review, savedReview);

          return savedSubmission.id;
        });

        console.log(
          `Submission #${submissionId} successfully saved in transaction`
        );
      } catch (txError) {
        console.error(
          `Transaction error creating submission for review #${savedReview.id}:`,
          txError
        );
        throw new Error(
          `Failed to create submission: ${
            txError instanceof Error ? txError.message : String(txError)
          }`
        );
      }

      // トランザクション完了後にキューに追加（遅延付き）
      if (submissionId) {
        // 保存の確認のため少し待機
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 提出が存在することを確認
        const submission = await this.submissionService.getSubmissionById(
          submissionId
        );

        if (submission) {
          console.log(
            `Verified submission #${submissionId} exists, adding to review queue`
          );
          await ReviewQueueService.getInstance().addToQueue(submissionId);
          console.log(`Added submission #${submissionId} to review queue`);
        } else {
          console.error(
            `Failed to find submission #${submissionId} after saving - CRITICAL ERROR`
          );
          throw new Error(`Submission #${submissionId} not found after save`);
        }
      } else {
        console.error(
          `No submission ID returned from transaction - CRITICAL ERROR`
        );
        throw new Error(
          `Failed to create submission for review #${savedReview.id}`
        );
      }

      return savedReview;
    } catch (error) {
      console.error(
        `Critical error creating review from PR #${prData.number}:`,
        error
      );
      throw error;
    } finally {
      // クリーンアップタイマーがまだあればクリア
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
      }

      // 一時ディレクトリのクリーンアップ (finallyブロックで必ず実行)
      if (tempRepoDir) {
        try {
          console.log(`Final cleanup of temp directory: ${tempRepoDir}`);
          await this.backlogService.cleanupRepository(tempRepoDir);
        } catch (cleanupError) {
          console.error(`Error in final cleanup:`, cleanupError);
        }
      }
    }
  }

  /**
   * ユーザーを検索または作成
   */
  private async findOrCreateUser(prData: PullRequestData): Promise<User> {
    let email = prData.authorMailAddress;
    const name = prData.authorName || "Backlog User";

    // メールアドレスがない場合は代替メールを生成
    if (!email) {
      email = `backlog_${
        prData.authorId || "unknown"
      }_${Date.now()}@example.com`;
    }

    try {
      // 既存のユーザーを検索
      let user = await this.userRepository.findOne({
        where: { email },
      });

      if (user) {
        return user;
      }

      // 新しいユーザーを作成
      console.log(`Creating new user: ${name} (${email})`);
      user = new User();
      user.name = name;
      user.email = email;
      user.password = Math.random().toString(36).substring(2, 15);
      user.role = UserRole.TRAINEE;

      return await this.userRepository.save(user);
    } catch (error) {
      console.error(
        `Error finding/creating user for ${name} (${email}):`,
        error
      );

      // エラー時はフォールバックユーザーを作成
      const fallbackEmail = `fallback_${Date.now()}@example.com`;
      const fallbackUser = new User();
      fallbackUser.name = "Backlog User";
      fallbackUser.email = fallbackEmail;
      fallbackUser.password = Math.random().toString(36).substring(2, 15);
      fallbackUser.role = UserRole.TRAINEE;

      return await this.userRepository.save(fallbackUser);
    }
  }

  /**
   * 差分データからコード内容を抽出
   */
  private extractCodeFromDiff(diffData: any): string {
    console.log("Extracting code from diff data");

    // すでに文字列の場合はそのまま返す
    if (typeof diffData === "string") {
      return diffData;
    }

    // diff情報を保持する文字列
    let extractedCode = "";

    try {
      // PR情報を取得
      if (diffData.pullRequest) {
        const pr = diffData.pullRequest;
        extractedCode += `// Pull Request #${pr.number}: ${pr.summary}\n`;
        extractedCode += `// Branch: ${pr.branch}\n`;
        extractedCode += `// Base: ${pr.base}\n\n`;
      }

      // コミット情報を処理
      if (diffData.commits && Array.isArray(diffData.commits)) {
        extractedCode += `// Changes from ${diffData.commits.length} commits\n\n`;

        // 最大5件のコミットメッセージを表示
        diffData.commits
          .slice(0, 5)
          .forEach((commit: { message: any }, index: number) => {
            extractedCode += `// Commit ${index + 1}: ${commit.message}\n`;
          });
        extractedCode += "\n";
      }

      // 差分情報を処理
      if (diffData.diffs && Array.isArray(diffData.diffs)) {
        for (const commitDiff of diffData.diffs) {
          if (commitDiff.diffs && Array.isArray(commitDiff.diffs)) {
            for (const fileDiff of commitDiff.diffs) {
              extractedCode += `// File: ${fileDiff.path || "unknown"}\n`;

              if (fileDiff.hunks && Array.isArray(fileDiff.hunks)) {
                for (const hunk of fileDiff.hunks) {
                  if (hunk.content) {
                    extractedCode += hunk.content + "\n";
                  }
                }
              } else {
                extractedCode += JSON.stringify(fileDiff, null, 2) + "\n";
              }

              extractedCode += "\n";
            }
          }
        }
      }

      // 配列の場合（ファイル毎の差分の場合）
      if (Array.isArray(diffData)) {
        console.log(`Processing diff data with ${diffData.length} entries`);

        diffData.forEach((item, index) => {
          if (typeof item === "string") {
            // 文字列の場合はそのまま追加
            extractedCode += item + "\n\n";
          } else if (typeof item === "object" && item !== null) {
            // オブジェクトの場合は構造に基づいて処理
            extractedCode += `=== ファイル ${index + 1} ===\n`;

            // ファイルパス情報があれば追加
            if (item.path) {
              extractedCode += `ファイル: ${item.path}\n`;
            }

            // 差分の種類があれば追加
            if (item.type) {
              extractedCode += `変更タイプ: ${item.type}\n`;
            }

            // ハンク（変更箇所）の処理
            if (item.hunks && Array.isArray(item.hunks)) {
              item.hunks.forEach(
                (
                  hunk: { content: string; lines: any[] },
                  hunkIndex: number
                ) => {
                  extractedCode += `\n--- 変更箇所 ${hunkIndex + 1} ---\n`;
                  if (hunk.content) {
                    extractedCode += hunk.content + "\n";
                  } else if (hunk.lines && Array.isArray(hunk.lines)) {
                    hunk.lines.forEach((line) => {
                      extractedCode += line + "\n";
                    });
                  }
                }
              );
            }

            // コンテンツが直接含まれている場合
            if (item.content) {
              extractedCode += item.content + "\n";
            }

            // 上記に該当しない場合は、JSONとして追加
            if (!item.path && !item.hunks && !item.content) {
              extractedCode += JSON.stringify(item, null, 2) + "\n";
            }

            extractedCode += "\n";
          }
        });
      }

      // 内容がない場合のフォールバック
      if (!extractedCode || extractedCode.trim() === "") {
        extractedCode = `// No code content could be extracted from the pull request diff.\n`;
        extractedCode += `// This might be because the PR doesn't have any code changes, or due to API limitations.\n`;

        if (diffData.pullRequest) {
          extractedCode += `\n// PR Title: ${diffData.pullRequest.summary}\n`;
          extractedCode += `// PR Description: ${
            diffData.pullRequest.description || "No description"
          }\n`;
        }
      }
    } catch (error) {
      console.error("Error extracting code from diff:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      extractedCode = `// Error extracting code: ${errorMessage}\n`;
      extractedCode += `// Raw diff data: ${JSON.stringify(diffData).substring(
        0,
        1000
      )}...\n`;
    }

    console.log(`Extracted code length: ${extractedCode.length} characters`);
    return extractedCode;
  }
}
