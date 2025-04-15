// backend/src/services/GitHubPullRequestMonitoringService.ts
import { AppDataSource } from "../index";
import { GitHubRepository } from "../models/GitHubRepository";
import { GitHubPullRequestTracker } from "../models/GitHubPullRequestTracker";
import { GitHubService } from "./GitHubService";
import { MentionDetectionService } from "./MentionDetectionService";
import { AIService } from "./AIService";
import { GitHubReviewFeedbackSenderService } from "./GitHubReviewFeedbackSenderService";
import { In } from "typeorm";
import { Feedback } from "../models/Feedback";
import { ExtractedFeedback } from "../interfaces/ExtractedFeedback";
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
    const startTime = new Date();

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
          if (!repo.access_token) {
            console.warn(
              `リポジトリ ${repo.owner}/${repo.name} にアクセストークンが設定されていません`
            );
            continue;
          }

          this.githubService.initializeWithToken(repo.access_token);

          // オープン状態のPRを取得
          const pullRequests = await this.getOpenPullRequests(
            repo.owner,
            repo.name
          );
          console.log(`オープンPR: ${pullRequests.length}件`);

          if (pullRequests.length === 0) {
            console.log(
              `リポジトリ ${repo.owner}/${repo.name} にはオープンPRがありません`
            );
            continue;
          }

          // 各PRを処理
          for (const pr of pullRequests) {
            try {
              const prNumber = pr.number;
              console.log(`PR #${prNumber} "${pr.title}" を処理中...`);

              // PRの説明文をチェック
              const prBody = pr.body || "";
              const hasMentionInDescription =
                this.mentionDetectionService.detectCodeReviewMention(prBody);

              if (hasMentionInDescription) {
                // 説明文に@codereviewメンションがある場合
                console.log(
                  `PR #${prNumber} の説明文に @codereview メンションがあります`
                );
                const isProcessed = await this.isPRDescriptionProcessed(
                  repo.owner,
                  repo.name,
                  prNumber
                );

                if (!isProcessed) {
                  // 未処理の場合は処理
                  console.log(
                    `PR #${prNumber} の説明文は未処理です。処理を開始します`
                  );
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
              } else {
                console.log(
                  `PR #${prNumber} の説明文に @codereview メンションはありません`
                );
              }

              // コメントをチェック
              console.log(`PR #${prNumber} のコメントを取得中...`);
              const comments = await this.githubService.getPullRequestComments(
                repo.owner,
                repo.name,
                prNumber
              );
              console.log(`PR #${prNumber} のコメント数: ${comments.length}`);

              let commentProcessed = false;

              for (const comment of comments) {
                const commentBody = comment.body || "";
                if (
                  this.mentionDetectionService.detectCodeReviewMention(
                    commentBody
                  )
                ) {
                  console.log(
                    `コメント #${comment.id} に @codereview メンションがあります`
                  );

                  // コメントが処理済みかチェック
                  const isProcessed = await this.isCommentProcessed(
                    repo.owner,
                    repo.name,
                    prNumber,
                    comment.id
                  );

                  if (!isProcessed) {
                    console.log(
                      `コメント #${comment.id} は未処理です。処理を開始します`
                    );
                    // 未処理の場合は処理
                    const result = await this.checkSinglePullRequest(
                      repo.owner,
                      repo.name,
                      prNumber,
                      comment.id
                    );
                    if (result) {
                      processed++;
                      commentProcessed = true;
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

              // 1つのPRにつき処理するのは最大1つのコメント（説明文か最新のコメント）
              if (commentProcessed) {
                console.log(
                  `PR #${prNumber} はコメントからのリクエストとして処理しました`
                );
                // この後のコメントはスキップしてもOK
                break;
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

    // 処理時間を計算
    const endTime = new Date();
    const elapsedMs = endTime.getTime() - startTime.getTime();

    console.log(
      `GitHub PRスキャン完了: 処理=${processed}件, スキップ=${skipped}件, 所要時間=${
        elapsedMs / 1000
      }秒`
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

      // アクセストークンが設定されているか確認
      if (!repository.access_token) {
        console.log(
          `リポジトリ ${owner}/${repo} にアクセストークンが設定されていません`
        );
        return false;
      }

      // GitHubサービスを初期化
      this.githubService = new GitHubService(); // 確実に新しいインスタンスを作成
      const initResult = this.githubService.initializeWithToken(
        repository.access_token
      );

      if (!initResult) {
        console.log(
          `リポジトリ ${owner}/${repo} のGitHub API初期化に失敗しました`
        );
        return false;
      }

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
      let previousComments = [];

      // 前回のレビュー情報を取得
      if (isReReview && trackerRecord) {
        console.log(
          `PR #${prNumber} は再レビューです（${trackerRecord.review_count}回目）`
        );

        // AIレビューコメントIDを取得
        try {
          const aiReviewCommentIds = JSON.parse(
            trackerRecord.ai_review_comment_ids || "[]"
          );

          // 前回のAIレビューコメントがある場合、それらを取得して内容をログに出力
          if (aiReviewCommentIds.length > 0) {
            console.log(
              `前回のAIレビューコメント一覧: ${aiReviewCommentIds.join(", ")}`
            );

            let allExtractedFeedbacks: ExtractedFeedback[] = [];

            // 最新のコメントを取得（最後のコメントIDを使用）
            const latestCommentId =
              aiReviewCommentIds[aiReviewCommentIds.length - 1];

            try {
              console.log(
                `最新のAIレビューコメント ID: ${latestCommentId} を取得します`
              );
              const latestComment =
                await this.githubService.getPullRequestComment(
                  owner,
                  repo,
                  latestCommentId
                );

              if (latestComment) {
                previousComments.push(latestComment);
                // ターミナルにコメント内容を出力
                console.log(
                  `\n------前回のAIレビューコメント ID: ${latestCommentId}------`
                );
                console.log(`コメント投稿者: ${latestComment.user.login}`);
                console.log(`コメント作成日時: ${latestComment.created_at}`);
                console.log(`コメント種別: ${latestComment.comment_type}`);
                console.log(
                  `コメント内容: \n${latestComment.body.substring(0, 500)}${
                    latestComment.body.length > 500 ? "...(省略)" : ""
                  }`
                );
                console.log(`----------------------------------\n`);

                // コメントからフィードバック項目を抽出
                const extractedFeedbacks = this.extractFeedbackFromComment(
                  latestComment.body
                );
                if (extractedFeedbacks.length > 0) {
                  allExtractedFeedbacks = [...extractedFeedbacks];
                  console.log(
                    `コメント #${latestCommentId} から ${extractedFeedbacks.length}件のフィードバック項目を抽出しました`
                  );

                  // 抽出したフィードバックの詳細を表示（デバッグ用）
                  extractedFeedbacks.forEach((feedback, index) => {
                    console.log(
                      `  [${index + 1}] ${
                        feedback.feedback_type === "strength"
                          ? "良い点"
                          : "改善点"
                      }: ${feedback.category} - ${feedback.point.substring(
                        0,
                        100
                      )}...`
                    );
                  });
                }
              }
            } catch (commentError) {
              console.error(
                `コメント #${latestCommentId} の取得中にエラーが発生しました:`,
                commentError
              );
            }

            // 抽出したすべてのフィードバックをpreviousFeedbacksに設定
            if (allExtractedFeedbacks.length > 0) {
              previousFeedbacks = allExtractedFeedbacks;
              console.log(
                `合計 ${previousFeedbacks.length}件のフィードバック項目を抽出しました`
              );
            }
          } else {
            console.log(`前回のAIレビューコメントはありません`);
          }
        } catch (e) {
          console.error("AIレビューコメントIDのパースエラー:", e);
        }
      }

      // レビュートークンを生成
      const reviewToken = `github-review-${owner}-${repo}-${prNumber}-${Date.now()}`;

      // AIレビューを実行（AIServiceに必要なパラメータを渡す）
      const aiService = new AIService(); // 新しいインスタンスを作成
      const reviewResult = await aiService.reviewGitHubPullRequest(
        owner,
        repo,
        prNumber,
        {
          isReReview,
          reviewToken,
          sourceCommentId: commentId,
          isDescriptionRequest: commentId === undefined,
          previousFeedbacks: previousFeedbacks || [],
          previousComments: previousComments, // 前回のコメント情報を渡す
        }
      );

      // レビュー結果が正しく生成されたか確認
      if (!reviewResult || reviewResult.length === 0) {
        console.warn(`PR #${prNumber} のレビュー結果が空です`);
        return false;
      }

      console.log(
        `PR #${prNumber} のレビュー結果: ${reviewResult.length} 件のフィードバック`
      );

      // レビュー結果をGitHubに送信
      const sendResult =
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

      if (!sendResult) {
        console.error(`PR #${prNumber} へのレビュー結果送信に失敗しました`);
        return false;
      }

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
   * コメントからフィードバック項目を抽出して構造化する
   * @param commentBody コメント本文
   * @returns 構造化されたフィードバック項目の配列
   */
  private extractFeedbackFromComment(commentBody: string): ExtractedFeedback[] {
    console.log("コメントからフィードバック項目を抽出します");
    const extractedFeedbacks: ExtractedFeedback[] = [];

    try {
      // コメント内の特定のパターンを検索
      // レビューID（reviewToken）を抽出
      const reviewTokenMatch = commentBody.match(/レビューID: `([^`]+)`/);
      const reviewToken = reviewTokenMatch ? reviewTokenMatch[1] : null;

      // 「良い点」セクションを抽出
      const strengthSectionMatch = commentBody.match(
        /## ✅ 良い点\s*\n\n([\s\S]*?)(?=\n##|$)/
      );
      const strengthSection = strengthSectionMatch
        ? strengthSectionMatch[1]
        : "";

      // 「改善提案」セクションを抽出
      const improvementSectionMatch = commentBody.match(
        /## 🔧 改善提案\s*\n\n([\s\S]*?)(?=\n##|$)/
      );
      const improvementSection = improvementSectionMatch
        ? improvementSectionMatch[1]
        : "";

      console.log(`レビューID: ${reviewToken || "不明"}`);
      console.log(
        `良い点セクション: ${strengthSection ? "抽出成功" : "抽出失敗"}`
      );
      console.log(
        `改善提案セクション: ${improvementSection ? "抽出成功" : "抽出失敗"}`
      );

      // 良い点セクションからカテゴリを抽出
      const strengthCategories = this.extractCategories(strengthSection);

      // 各カテゴリ内の良い点を抽出
      for (const category of strengthCategories) {
        const categoryItems = this.extractCategoryItems(
          strengthSection,
          category,
          "strength"
        );
        extractedFeedbacks.push(...categoryItems);
      }

      // 改善提案セクションからカテゴリを抽出
      const improvementCategories = this.extractCategories(improvementSection);

      // 各カテゴリ内の改善提案を抽出
      for (const category of improvementCategories) {
        const categoryItems = this.extractCategoryItems(
          improvementSection,
          category,
          "improvement"
        );
        extractedFeedbacks.push(...categoryItems);
      }

      console.log(
        `抽出されたフィードバック項目: ${extractedFeedbacks.length}件`
      );

      return extractedFeedbacks;
    } catch (error) {
      console.error("フィードバック抽出エラー:", error);
      return [];
    }
  }

  /**
   * マークダウンテキストからカテゴリを抽出
   */
  private extractCategories(text: string): string[] {
    if (!text) return [];

    const categoryRegex = /### (.*?)(?=\n\n|\n###|$)/g;
    const categories = [];
    let match;

    while ((match = categoryRegex.exec(text)) !== null) {
      categories.push(match[1].trim());
    }

    return categories;
  }

  /**
   * カテゴリセクション内の個別フィードバック項目を抽出
   */
  private extractCategoryItems(
    text: string,
    category: string,
    feedbackType: "strength" | "improvement"
  ): ExtractedFeedback[] {
    if (!text) return [];

    const items: ExtractedFeedback[] = [];

    // カテゴリセクションを抽出
    const categoryRegex = new RegExp(
      `### ${this.escapeRegExp(category)}\\s*\\n\\n([\\s\\S]*?)(?=\\n###|$)`,
      "i"
    );
    const categoryMatch = text.match(categoryRegex);

    if (!categoryMatch || !categoryMatch[1]) return [];

    const categoryContent = categoryMatch[1];

    if (feedbackType === "strength") {
      // 良い点の抽出パターン
      const itemRegex =
        /\*\*([\d]+)\. (.*?)\*\*\s*\n\n([\s\S]*?)(?=\*\*[\d]+\.|---|\n\n$|$)/g;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(categoryContent)) !== null) {
        const pointText = itemMatch[2].trim();
        const detailsText = itemMatch[3].trim();

        // コードスニペットを抽出
        const codeMatch = detailsText.match(/```\n([\s\S]*?)```/);
        const codeSnippet = codeMatch ? codeMatch[1].trim() : undefined;

        // 参考URLを抽出
        const urlMatch = detailsText.match(
          /📚 \*\*参考\*\*: \[(.*?)\]\((.*?)\)/
        );
        const referenceUrl = urlMatch ? urlMatch[2].trim() : undefined;

        items.push({
          feedback_type: "strength",
          category: this.mapCategoryDisplayNameToKey(category),
          point: pointText,
          code_snippet: codeSnippet,
          reference_url: referenceUrl,
        });
      }
    } else {
      // 改善提案の抽出パターン
      const itemRegex =
        /#### ([\d]+)\. (.*?)\s*\n\n([\s\S]*?)(?=####|\n\n$|$)/g;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(categoryContent)) !== null) {
        const pointText = itemMatch[2].trim();
        const detailsText = itemMatch[3].trim();

        // 改善提案を抽出
        const suggestionMatch = detailsText.match(
          /\*\*改善案\*\*: (.*?)(?=\n\n|$)/
        );
        const suggestion = suggestionMatch
          ? suggestionMatch[1].trim()
          : undefined;

        // コードスニペットを抽出
        const codeMatch = detailsText.match(/```\n([\s\S]*?)```/);
        const codeSnippet = codeMatch ? codeMatch[1].trim() : undefined;

        // 参考URLを抽出
        const urlMatch = detailsText.match(
          /📚 \*\*参考資料\*\*: \[(.*?)\]\((.*?)\)/
        );
        const referenceUrl = urlMatch ? urlMatch[2].trim() : undefined;

        items.push({
          feedback_type: "improvement",
          category: this.mapCategoryDisplayNameToKey(category),
          point: pointText,
          suggestion: suggestion,
          code_snippet: codeSnippet,
          reference_url: referenceUrl,
        });
      }
    }

    return items;
  }

  /**
   * 正規表現で使用する特殊文字をエスケープ
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * カテゴリの表示名をAPIキーに変換
   */
  private mapCategoryDisplayNameToKey(displayName: string): string {
    const displayToKey: { [key: string]: string } = {
      "💻 コード品質": "code_quality",
      "🔒 セキュリティ": "security",
      "⚡ パフォーマンス": "performance",
      "📘 ベストプラクティス": "best_practice",
      "📖 可読性": "readability",
      "✅ 機能性": "functionality",
      "🔧 保守性": "maintainability",
      "🏗️ アーキテクチャ": "architecture",
      "📋 その他": "other",
    };

    return displayToKey[displayName] || "other";
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
   * 指定されたリポジトリのオープン状態のPRを取得
   * @param owner リポジトリオーナー
   * @param repo リポジトリ名
   * @returns オープンPRの配列
   */
  private async getOpenPullRequests(
    owner: string,
    repo: string
  ): Promise<any[]> {
    try {
      console.log(`リポジトリ ${owner}/${repo} のオープンPRを取得します`);

      // GitHubサービスを使用してオープンPRを取得（state=openでAPI呼び出し）
      const pullRequests = await this.githubService.getPullRequests(
        owner,
        repo,
        "open", // open状態のPRのみ
        "updated", // 更新日時でソート
        "desc", // 降順（最新が先頭）
        100 // 一度に最大100件取得
      );

      if (pullRequests.length > 0) {
        console.log(
          `${owner}/${repo} で ${pullRequests.length}件のオープンPRを取得しました`
        );

        // デバッグ情報：取得したPRの番号とタイトルを表示
        pullRequests.forEach((pr) => {
          console.log(`  PR #${pr.number}: ${pr.title} (${pr.updated_at})`);
        });
      } else {
        console.log(`${owner}/${repo} にはオープンPRがありません`);
      }

      return pullRequests;
    } catch (error) {
      console.error(`オープンPR取得エラー (${owner}/${repo}):`, error);

      // エラーの詳細情報を記録
      if (error instanceof Error) {
        console.error(`エラー種別: ${error.name}`);
        console.error(`エラーメッセージ: ${error.message}`);
        console.error(`スタックトレース: ${error.stack}`);
      }

      // エラー時は空配列を返す
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

  /**
   * 特定のリポジトリだけを対象にPRチェックを実行（テスト用）
   * @param repositoryId GitHubリポジトリのID
   */
  async testSingleRepository(repositoryId: number): Promise<{
    repository: string;
    pullRequests: number;
    processed: number;
    skipped: number;
  }> {
    console.log(`リポジトリID: ${repositoryId} のテストを実行します`);
    let processed = 0;
    let skipped = 0;
    let pullRequestCount = 0;
    let repositoryName = "";

    try {
      // リポジトリを取得
      const repository = await this.githubRepositoryRepository.findOne({
        where: { id: repositoryId, is_active: true },
      });

      if (!repository) {
        console.error(`リポジトリID ${repositoryId} が見つからないか無効です`);
        return {
          repository: "不明",
          pullRequests: 0,
          processed: 0,
          skipped: 0,
        };
      }

      repositoryName = `${repository.owner}/${repository.name}`;
      console.log(`リポジトリ ${repositoryName} をテストします`);

      // APIクライアントを初期化
      if (!repository.access_token) {
        console.warn(
          `リポジトリ ${repositoryName} にアクセストークンが設定されていません`
        );
        return {
          repository: repositoryName,
          pullRequests: 0,
          processed: 0,
          skipped: 0,
        };
      }

      this.githubService.initializeWithToken(repository.access_token);

      // 接続テスト
      try {
        const repoInfo = await this.githubService.getRepositoryInfo(
          repository.owner,
          repository.name
        );
        console.log(`リポジトリ情報取得成功: ${repoInfo?.full_name || "不明"}`);
      } catch (connError) {
        console.error(`リポジトリ接続テストに失敗しました:`, connError);
        return {
          repository: repositoryName,
          pullRequests: 0,
          processed: 0,
          skipped: 0,
        };
      }

      // オープン状態のPRを取得
      const pullRequests = await this.getOpenPullRequests(
        repository.owner,
        repository.name
      );
      pullRequestCount = pullRequests.length;
      console.log(`オープンPR: ${pullRequestCount}件`);

      if (pullRequestCount === 0) {
        return {
          repository: repositoryName,
          pullRequests: 0,
          processed: 0,
          skipped: 0,
        };
      }

      // 各PRを処理
      for (const pr of pullRequests) {
        try {
          const prNumber = pr.number;
          console.log(
            `PR #${prNumber} "${pr.title}" (${pr.html_url}) のテスト`
          );

          // PR情報を表示
          console.log(`  作成者: ${pr.user.login}`);
          console.log(`  作成日時: ${pr.created_at}`);
          console.log(`  更新日時: ${pr.updated_at}`);
          console.log(`  ブランチ: ${pr.head.ref} → ${pr.base.ref}`);
          console.log(
            `  状態: ${pr.state} (マージ可能: ${pr.mergeable_state || "不明"})`
          );

          // メンション検出のテスト
          const prBody = pr.body || "";
          const hasMentionInDescription =
            this.mentionDetectionService.detectCodeReviewMention(prBody);
          console.log(
            `  説明文に @codereview メンション: ${
              hasMentionInDescription ? "あり" : "なし"
            }`
          );

          // このテスト用メソッドでは実際の処理は行わず、情報表示のみ
          skipped++;
        } catch (prError) {
          console.error(
            `PR #${pr.number} (${repositoryName}) のテスト中にエラー:`,
            prError
          );
          skipped++;
        }
      }
    } catch (error) {
      console.error(`リポジトリテスト中にエラーが発生しました:`, error);
    }

    return {
      repository: repositoryName,
      pullRequests: pullRequestCount,
      processed,
      skipped,
    };
  }
}
