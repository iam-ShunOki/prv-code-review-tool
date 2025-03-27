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
      }`
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
            });
          }

          // 提出のステータスを更新
          const submissionService = new SubmissionService();
          await submissionService.updateSubmissionStatus(
            submissionId,
            SubmissionStatus.REVIEWED
          );

          console.log(
            `PR #${prData.number} のレビューが完了し、フィードバックを保存しました`
          );

          // オプション: BacklogPRにコメントを送信
          try {
            const reviewFeedbackSender = new ReviewFeedbackSenderService();
            await reviewFeedbackSender.sendReviewFeedbackToPullRequest(
              review.id
            );
          } catch (sendError) {
            console.error(
              `PR #${prData.number} へのフィードバック送信中にエラーが発生しました:`,
              sendError
            );
            // 送信エラーは無視して処理を継続
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

    // デバッグ情報を追加
    console.log(`差分データの型: ${typeof diffData}`);
    if (typeof diffData === "object") {
      console.log(`差分データのキー: ${Object.keys(diffData).join(", ")}`);
      console.log(
        `変更されたファイル: ${JSON.stringify(diffData.changedFiles)}`
      );
    }

    // すでに文字列の場合はそのまま返す
    if (typeof diffData === "string") {
      console.log(`文字列の差分データを受信しました (${diffData.length} 文字)`);
      return diffData;
    }

    // 差分情報を保持する文字列
    let extractedCode = "";
    let debugging = "";

    try {
      // PR情報を取得
      if (diffData.pullRequest) {
        const pr = diffData.pullRequest;
        extractedCode += `// プルリクエスト #${pr.number}: ${pr.summary}\n`;
        extractedCode += `// ブランチ: ${pr.branch}\n`;
        extractedCode += `// ベース: ${pr.base}\n\n`;
        debugging += `PR情報を取得しました: #${pr.number}\n`;
      }

      // コミット情報を処理
      if (diffData.commits && Array.isArray(diffData.commits)) {
        extractedCode += `// ${diffData.commits.length} コミットの変更内容\n\n`;
        debugging += `${diffData.commits.length} コミットを見つけました\n`;

        // 最大5件のコミットメッセージを表示
        diffData.commits
          .slice(0, 5)
          .forEach((commit: { message: any }, index: number) => {
            extractedCode += `// コミット ${index + 1}: ${commit.message}\n`;
          });
        extractedCode += "\n";
      }

      // diffData.diffsがなく、直接diffsが配列として渡されることもある
      const diffsToProcess = Array.isArray(diffData)
        ? diffData
        : diffData.diffs && Array.isArray(diffData.diffs)
        ? diffData.diffs
        : null;

      // CASE 1: ルート階層に直接diffs配列がある場合
      if (Array.isArray(diffData)) {
        debugging += `diffs配列を処理します (${diffData.length} 項目)\n`;
        for (const diff of diffData) {
          if (typeof diff === "object" && diff !== null) {
            // ファイル情報の追加
            if (diff.path) {
              extractedCode += `\n// ファイル: ${diff.path}\n`;
              debugging += `ファイルを見つけました: ${diff.path}\n`;
            }

            // hunksの処理
            if (diff.hunks && Array.isArray(diff.hunks)) {
              debugging += `${diff.hunks.length} ハンクを見つけました\n`;
              for (const hunk of diff.hunks) {
                if (hunk.content) {
                  extractedCode += hunk.content + "\n";
                  debugging += `ハンク内容を追加しました (${hunk.content.length} 文字)\n`;
                } else if (hunk.lines && Array.isArray(hunk.lines)) {
                  for (const line of hunk.lines) {
                    extractedCode += line + "\n";
                  }
                  debugging += `ハンクから ${hunk.lines.length} 行を追加しました\n`;
                }
              }
            }
          }
        }
      }
      // CASE 2: diffData.diffs配列がある場合
      else if (diffData.diffs && Array.isArray(diffData.diffs)) {
        debugging += `diffData.diffs を処理します (${diffData.diffs.length} 項目)\n`;

        for (const commitDiff of diffData.diffs) {
          if (commitDiff.diffs && Array.isArray(commitDiff.diffs)) {
            for (const fileDiff of commitDiff.diffs) {
              if (fileDiff.path) {
                extractedCode += `\n// ファイル: ${fileDiff.path}\n`;
                debugging += `ファイルを見つけました: ${fileDiff.path}\n`;
              }

              if (fileDiff.hunks && Array.isArray(fileDiff.hunks)) {
                debugging += `${fileDiff.hunks.length} ハンクを見つけました\n`;
                for (const hunk of fileDiff.hunks) {
                  if (hunk.content) {
                    extractedCode += hunk.content + "\n";
                    debugging += `ハンク内容を追加しました (${hunk.content.length} 文字)\n`;
                  } else if (hunk.lines && Array.isArray(hunk.lines)) {
                    for (const line of hunk.lines) {
                      extractedCode += line + "\n";
                    }
                    debugging += `ハンクから ${hunk.lines.length} 行を追加しました\n`;
                  }
                }
              }
            }
          }
        }
      }

      // 内容がない場合のフォールバック
      if (!extractedCode || extractedCode.trim() === "") {
        extractedCode = `// プルリクエストの差分からコード内容を抽出できませんでした。\n`;
        extractedCode += `// PRに変更されたコードがないか、APIの制限により取得できなかった可能性があります。\n`;

        if (diffData.pullRequest) {
          extractedCode += `\n// PRタイトル: ${diffData.pullRequest.summary}\n`;
          extractedCode += `// PR説明: ${
            diffData.pullRequest.description || "説明なし"
          }\n`;
        }

        // JSONダンプを追加してデバッグに役立てる
        extractedCode += "\n// デバッグ情報開始\n";
        extractedCode += "// " + debugging.replace(/\n/g, "\n// ");
        try {
          const diffStr = JSON.stringify(diffData).substring(0, 1000);
          extractedCode += `\n// 差分データ (省略): ${diffStr}...\n`;
        } catch (e) {
          extractedCode += "\n// 差分データをJSON化できませんでした\n";
        }
        extractedCode += "// デバッグ情報終了\n";
      }

      // ローカルデバッグ用のファイル出力（開発環境のみ）
      if (process.env.NODE_ENV === "development") {
        try {
          const fs = require("fs");
          const path = require("path");
          const debugDir = path.join(__dirname, "../../temp/debug");

          if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          fs.writeFileSync(
            path.join(debugDir, `extracted-code-${timestamp}.txt`),
            extractedCode
          );

          console.log(`抽出したコードをデバッグファイルに保存しました`);
        } catch (e) {
          console.error("デバッグファイル保存エラー:", e);
        }
      }
    } catch (error) {
      console.error("差分からコード抽出中にエラーが発生しました:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      extractedCode = `// コード抽出エラー: ${errorMessage}\n`;
      extractedCode += `// 生の差分データ: ${JSON.stringify(diffData).substring(
        0,
        1000
      )}...\n`;
    }

    console.log(`抽出したコードの長さ: ${extractedCode.length} 文字`);

    // 抽出したコードの一部をログに出力
    const previewLength = Math.min(200, extractedCode.length);
    console.log(
      `抽出コードのプレビュー: ${extractedCode.substring(0, previewLength)}${
        extractedCode.length > previewLength ? "..." : ""
      }`
    );

    return extractedCode;
  }
}
