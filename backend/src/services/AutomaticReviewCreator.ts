// backend/src/services/AutomaticReviewCreator.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { User, UserRole } from "../models/User";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { FeedbackPriority } from "../models/Feedback";
import { BacklogService } from "./BacklogService";
import { ReviewQueueService } from "./ReviewQueueService";
import { AIService } from "./AIService";
import { FeedbackService } from "./FeedbackService";
import { ReviewFeedbackSenderService } from "./ReviewFeedbackSenderService";
import { SubmissionService } from "./SubmissionService";
import { EntityManager, Repository } from "typeorm";
import { RepositoryWhitelistService } from "./RepositoryWhitelistService";
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

interface ReviewContext {
  isReReview?: boolean;
  reviewHistory?: any[];
  comments?: any[];
  existingReviewId?: number;
  sourceCommentId?: number;
  reviewToken?: string;
  isDescriptionRequest?: boolean;
  checklistProgress?: number;
  previousFeedbacks?: any[];
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
   * プルリクエストからレビューを作成（コンテキスト拡張版）
   */
  async createReviewFromPullRequest(
    prData: PullRequestData,
    context?: ReviewContext
  ): Promise<Review> {
    console.log(
      `PR #${prData.number} (${prData.project}/${
        prData.repository
      }) からレビューを作成します ${
        context?.isReReview ? "【再レビュー】" : "【初回レビュー】"
      }${context?.isDescriptionRequest ? " 【説明文由来】" : ""}`
    );

    let tempRepoDir = "";
    let cleanupTimer: NodeJS.Timeout | null = null;

    try {
      // 既存のレビューがあるか確認
      let existingReview = null;

      if (context?.existingReviewId) {
        existingReview = await this.reviewRepository.findOne({
          where: { id: context.existingReviewId },
        });
      } else {
        existingReview = await this.reviewRepository.findOne({
          where: {
            backlog_pr_id: prData.number,
            backlog_project: prData.project,
            backlog_repository: prData.repository,
          },
        });
      }

      if (existingReview && !context?.isReReview) {
        console.log(
          `PR #${prData.number} のレビューは既に存在します: レビューID #${existingReview.id}`
        );
        return existingReview;
      }

      // ユーザーを見つけるか作成
      const user = await this.findOrCreateUser(prData);
      console.log(
        `ユーザー ${user.name} (${user.email}) ID: ${user.id} を使用します`
      );

      // 新しいレビューを作成するか、既存のレビューを使用
      let review: Review;

      if (existingReview && context?.isReReview) {
        review = existingReview;
        review.description = `Backlogプルリクエストから更新されたレビュー (${new Date().toLocaleString(
          "ja-JP"
        )})\n\n${prData.description}\n\nProject: ${
          prData.project
        }\nRepository: ${prData.repository}\nBranch: ${prData.branch}`;
        review.status = ReviewStatus.PENDING;

        await this.reviewRepository.save(review);
        console.log(
          `既存のレビュー #${review.id} を更新しました (PR #${prData.number})`
        );
      } else {
        // 新規レビューを作成
        review = new Review();
        review.user_id = user.id;
        review.title = `PR #${prData.number}: ${prData.summary}`;
        review.description = `Backlogプルリクエストから自動作成されたレビュー\n\n${prData.description}\n\nProject: ${prData.project}\nRepository: ${prData.repository}\nBranch: ${prData.branch}`;
        review.status = ReviewStatus.PENDING;
        review.backlog_pr_id = prData.number;
        review.backlog_project = prData.project;
        review.backlog_repository = prData.repository;

        const savedReview = await this.reviewRepository.save(review);
        review = savedReview;
        console.log(
          `新規レビュー #${review.id} を作成しました (PR #${prData.number})`
        );
      }

      // コード取得とコード提出作成
      let codeContent = "";
      let submissionId: number | null = null;

      try {
        // 自動クリーンアップタイマー設定（10分後）
        cleanupTimer = setTimeout(async () => {
          if (tempRepoDir) {
            console.log(
              `クリーンアップタイマーが実行されました: ${tempRepoDir}`
            );
            try {
              await this.backlogService.cleanupRepository(tempRepoDir);
              tempRepoDir = ""; // クリーンアップ後は空文字列に設定
            } catch (timeoutError) {
              console.error(
                `クリーンアップタイマーでエラーが発生しました:`,
                timeoutError
              );
            }
          }
        }, 10 * 60 * 1000);

        // リポジトリをクローン
        tempRepoDir = await this.backlogService.cloneRepository(
          prData.project,
          prData.repository,
          prData.base
        );
        console.log(`リポジトリを ${tempRepoDir} にクローンしました`);

        // 差分を取得
        const diffData = await this.backlogService.getPullRequestDiff(
          prData.project,
          prData.repository,
          prData.number
        );

        // 差分からコード内容を抽出
        codeContent = this.extractCodeFromDiff(diffData);
        console.log(`コード内容を抽出しました (${codeContent.length} 文字)`);

        // タイマーをクリア
        if (cleanupTimer) {
          clearTimeout(cleanupTimer);
          cleanupTimer = null;
        }

        // クローンしたリポジトリをクリーンアップ
        if (tempRepoDir) {
          try {
            await this.backlogService.cleanupRepository(tempRepoDir);
            console.log(`リポジトリを削除しました: ${tempRepoDir}`);
            tempRepoDir = ""; // クリーンアップ後は空文字列に設定
          } catch (cleanupError) {
            console.error(
              `リポジトリ削除中にエラーが発生しました:`,
              cleanupError
            );
            // エラーがあっても処理を継続
          }
        }
      } catch (codeError) {
        console.error(
          `PR #${prData.number} のコード取得中にエラーが発生しました:`,
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
          submission.review_id = review.id;
          submission.code_content =
            codeContent ||
            `// PR #${prData.number} (${prData.project}/${prData.repository}) のコード内容を取得できませんでした`;
          submission.expectation = `Backlogプルリクエスト #${prData.number} (${
            prData.project
          }/${prData.repository}) から自動作成されました。${
            context?.isReReview ? "【再レビュー】" : ""
          }`;
          submission.status = SubmissionStatus.SUBMITTED;
          submission.version = 1;

          // トランザクション内でコード提出を保存
          const savedSubmission = await manager.save(
            CodeSubmission,
            submission
          );
          console.log(
            `コード提出 #${savedSubmission.id} をレビュー #${review.id} に作成しました`
          );

          // レビューのステータスを更新
          review.status = ReviewStatus.IN_PROGRESS;
          await manager.save(Review, review);

          return savedSubmission.id;
        });

        console.log(
          `コード提出 #${submissionId} をトランザクションで保存しました`
        );
      } catch (txError) {
        console.error(
          `レビュー #${review.id} のコード提出作成中にトランザクションエラーが発生しました:`,
          txError
        );
        throw new Error(
          `コード提出の作成に失敗しました: ${
            txError instanceof Error ? txError.message : String(txError)
          }`
        );
      }

      // レビューIDを取得
      const reviewId = review.id;

      // トランザクション完了後にAIレビューを実行
      if (submissionId) {
        try {
          console.log(
            `PR #${prData.number} のAIレビューを開始します ${
              context?.isReReview ? "【再レビュー】" : ""
            }`
          );

          // AIServiceを初期化
          const aiService = new AIService();

          // プルリクエストレビューを実行（コンテキスト付き）
          const reviewFeedbacks = await aiService.reviewPullRequest(
            prData.project,
            prData.repository,
            prData.number,
            {
              isReReview: context?.isReReview || false,
              reviewHistory: context?.reviewHistory || [],
              comments: context?.comments || [],
              reviewToken: context?.reviewToken,
              sourceCommentId: context?.sourceCommentId,
              isDescriptionRequest: context?.isDescriptionRequest, // 説明文由来かどうかを渡す
            }
          );

          console.log(
            `PR #${prData.number} に対して ${reviewFeedbacks.length} 件のフィードバックを生成しました`
          );

          // フィードバックをデータベースに保存
          const feedbackService = new FeedbackService();
          for (const feedback of reviewFeedbacks) {
            await feedbackService.createFeedback({
              submission_id: submissionId,
              problem_point: feedback.problem_point,
              suggestion: feedback.suggestion,
              priority: feedback.priority,
              reference_url: feedback.reference_url,
              code_snippet: feedback.code_snippet,
              category: feedback.category,
              // review_tokenは保存対象のプロパティにないので渡さない
            });
          }

          // 提出のステータスを更新
          const submissionService = new SubmissionService();
          await submissionService.updateSubmissionStatus(
            submissionId,
            SubmissionStatus.REVIEWED
          );

          // 【改善部分】レビュー完了後、即時にBacklogへのフィードバック送信を実行
          try {
            console.log(
              `PR #${prData.number} へのフィードバックを即時送信します`
            );

            // リポジトリがホワイトリストに登録され、自動返信が許可されているか確認
            const whitelistService = RepositoryWhitelistService.getInstance();
            const isAutoReplyAllowed =
              await whitelistService.isAutoReplyAllowed(
                prData.project,
                prData.repository
              );

            if (!isAutoReplyAllowed) {
              console.log(
                `リポジトリ ${prData.project}/${prData.repository} は自動返信が許可されていないため送信をスキップします`
              );
            } else {
              // フィードバック送信を実行
              const reviewFeedbackSender = new ReviewFeedbackSenderService();
              const result =
                await reviewFeedbackSender.sendReviewFeedbackToPullRequest(
                  reviewId,
                  true // 強制送信フラグを有効化
                );

              if (result) {
                console.log(
                  `PR #${prData.number} へのフィードバック送信が完了しました`
                );
              } else {
                console.error(
                  `PR #${prData.number} へのフィードバック送信に失敗しました`
                );
                // エラーを発生させずに継続
              }
            }
          } catch (sendError) {
            // 送信エラーの詳細ログを出力
            console.error(
              `PR #${prData.number} へのフィードバック送信中にエラーが発生しました:`,
              sendError
            );
            // エラーを発生させずに処理を継続
          }
        } catch (reviewError) {
          console.error(
            `PR #${prData.number} のAIレビュー中にエラーが発生しました:`,
            reviewError
          );

          // エラー時もDBに記録
          const feedbackService = new FeedbackService();
          await feedbackService.createFeedback({
            submission_id: submissionId,
            problem_point: "レビュー処理中にエラーが発生しました",
            suggestion: `エラー: ${
              reviewError instanceof Error
                ? reviewError.message
                : String(reviewError)
            }。システム管理者に連絡してください。`,
            priority: FeedbackPriority.MEDIUM,
          });

          // エラー時も提出ステータスを更新
          const submissionService = new SubmissionService();
          await submissionService.updateSubmissionStatus(
            submissionId,
            SubmissionStatus.REVIEWED
          );
        }
      }

      return review;
    } catch (error) {
      console.error(
        `PR #${prData.number} からのレビュー作成中に重大なエラーが発生しました:`,
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
          console.log(`最終クリーンアップ: ${tempRepoDir}`);
          await this.backlogService.cleanupRepository(tempRepoDir);
        } catch (cleanupError) {
          console.error(
            `最終クリーンアップでエラーが発生しました:`,
            cleanupError
          );
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
      console.log(`新規ユーザーを作成します: ${name} (${email})`);
      user = new User();
      user.name = name;
      user.email = email;
      user.password = Math.random().toString(36).substring(2, 15);
      user.role = UserRole.TRAINEE;

      return await this.userRepository.save(user);
    } catch (error) {
      console.error(
        `ユーザー ${name} (${email}) の検索/作成中にエラーが発生しました:`,
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
   * 差分データからコード内容を抽出（改善版）
   */
  private extractCodeFromDiff(diffData: any): string {
    console.log("差分データからコード内容を抽出します");

    // デバッグ情報
    console.log(`差分データの型: ${typeof diffData}`);

    // すでに文字列の場合はそのまま返す
    if (typeof diffData === "string") {
      console.log(`文字列の差分データを受信しました (${diffData.length} 文字)`);
      return diffData;
    }

    // 差分情報を保持する文字列
    let extractedCode = "";

    try {
      // changedFilesが存在する場合、その情報を使用
      if (diffData.changedFiles && Array.isArray(diffData.changedFiles)) {
        console.log(
          `変更ファイル: ${diffData.changedFiles.length}個を処理します`
        );

        // 各変更ファイルからコードを抽出
        for (const file of diffData.changedFiles) {
          if (file.filePath) {
            extractedCode += `\n// ファイル: ${file.filePath}\n`;

            // 追加された行や変更された行のみ抽出
            if (file.diff) {
              const lines = file.diff.split("\n");
              for (const line of lines) {
                // 追加された行だけを抽出 (+ で始まる行)
                if (line.startsWith("+") && !line.startsWith("+++")) {
                  // + を取り除いて追加
                  extractedCode += line.substring(1) + "\n";
                }
              }
            } else if (file.content && file.status === "added") {
              // 新規ファイルの場合はすべての内容を含める
              extractedCode += file.content;
            }
          }
        }
      } else if (diffData.diffs && Array.isArray(diffData.diffs)) {
        // バックアップ: 別の形式でdiffsが存在する場合
        console.log(`diffデータを処理: ${diffData.diffs.length}件`);

        for (const diff of diffData.diffs) {
          if (diff.path) {
            extractedCode += `\n// ファイル: ${diff.path}\n`;

            if (diff.hunks && Array.isArray(diff.hunks)) {
              for (const hunk of diff.hunks) {
                if (hunk.lines && Array.isArray(hunk.lines)) {
                  for (const line of hunk.lines) {
                    // 追加された行だけを抽出
                    if (line.startsWith("+") && !line.startsWith("+++")) {
                      extractedCode += line.substring(1) + "\n";
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 内容がない場合のフォールバック
      if (!extractedCode || extractedCode.trim() === "") {
        console.log("コード抽出に失敗しました。一般的な情報のみ返します");
        extractedCode = `// プルリクエストからコードを抽出できませんでした。\n`;

        if (diffData.pullRequest) {
          extractedCode += `// PR: ${diffData.pullRequest.summary}\n`;
          extractedCode += `// 説明: ${
            diffData.pullRequest.description || "説明なし"
          }\n`;
        }
      }

      console.log(`抽出したコードの長さ: ${extractedCode.length} 文字`);
      return extractedCode;
    } catch (error) {
      console.error("差分からコード抽出中にエラーが発生しました:", error);
      return `// コード抽出エラー: ${
        error instanceof Error ? error.message : String(error)
      }\n`;
    }
  }
}
