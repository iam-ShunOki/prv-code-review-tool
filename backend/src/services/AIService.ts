// backend/src/services/AIService.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { FeedbackService } from "./FeedbackService";
import {
  Feedback,
  FeedbackCategory,
  FeedbackPriority,
} from "../models/Feedback";
import { AppDataSource } from "../index";
import { SubmissionService } from "./SubmissionService";
import {
  CodeEvaluationCriteria,
  CategoryPriorityMap,
} from "../constants/CodeEvaluationCriteria";
import { BacklogService } from "./BacklogService";
import { RepositoryVectorSearchService } from "./RepositoryVectorSearchService";
import { GitHubService } from "./GitHubService";
import { GitHubRepository } from "../models/GitHubRepository";

// プルリクエストレビューのコンテキスト型
interface PullRequestReviewContext {
  isReReview?: boolean;
  reviewHistory?: any[];
  comments?: any[];
  reviewToken?: string; // レビュートークンを追加
  sourceCommentId?: number;
  isDescriptionRequest?: boolean; // 説明文由来かどうかを追加
  isPrUpdate?: boolean; // PR更新かどうかを追加
  previousFeedbacks?: any[]; // 前回のフィードバック情報を追加
  codeChangeSummary?: string; // コード変更サマリー
}

// GitHubプルリクエストレビューのコンテキスト型を定義
interface GitHubPullRequestReviewContext {
  isReReview?: boolean;
  reviewHistory?: any[];
  comments?: any[];
  reviewToken?: string;
  sourceCommentId?: number;
  isDescriptionRequest?: boolean;
  isPrUpdate?: boolean;
  previousFeedbacks?: any[];
  previousComments?: any[]; // 追加: 前回のコメント情報
  codeChangeSummary?: string;
}
export class AIService {
  // private model: ChatOpenAI;
  private model: ChatAnthropic;
  private outputParser: StringOutputParser;
  private feedbackService: FeedbackService;
  private submissionService: SubmissionService;
  private backlogService: BacklogService;
  private githubService: GitHubService;
  private repositoryVectorService: RepositoryVectorSearchService;

  constructor() {
    // APIキーの存在確認
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OpenAI APIキーが環境変数に設定されていません");
    }

    // モデルの初期化
    // const modelName = process.env.OPENAI_MODEL || "gpt-4o";
    // console.log(`OpenAIモデルを初期化します: ${modelName}`);
    const modelName = "claude-3-7-sonnet-20250219";
    console.log(`OpenAIモデルを初期化します: ${modelName}`);

    try {
      // this.model = new ChatOpenAI({
      //   modelName: modelName,
      //   temperature: 0.1, // 一貫性のため低い温度を設定
      //   openAIApiKey: process.env.OPENAI_API_KEY,
      //   timeout: 120000, // タイムアウトを120秒に設定
      // });
      this.model = new ChatAnthropic({
        modelName: modelName,
        temperature: 0.1, // 一貫性のため低い温度を設定
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      });
    } catch (error) {
      console.error("OpenAIモデルの初期化に失敗しました:", error);
      throw new Error("AIサービスの初期化に失敗しました");
    }

    this.outputParser = new StringOutputParser();
    this.feedbackService = new FeedbackService();
    this.submissionService = new SubmissionService();
    this.backlogService = new BacklogService();
    this.repositoryVectorService = new RepositoryVectorSearchService();
  }

  /**
   * コードレビューの実行
   */
  async reviewCode(submission: CodeSubmission): Promise<void> {
    console.log(`コード提出 #${submission.id} のレビューを開始します`);

    try {
      // 既存のフィードバックを削除（再レビューの場合）
      const existingFeedbacks =
        await this.feedbackService.getFeedbacksBySubmissionId(submission.id);

      if (existingFeedbacks.length > 0) {
        console.log(
          `既存のフィードバック ${existingFeedbacks.length} 件を削除します`
        );
        await AppDataSource.getRepository(Feedback).remove(existingFeedbacks);
      }

      // 評価基準とコードの分析結果を取得
      const evaluationResult = await this.evaluateCodeAgainstCriteria(
        submission.code_content
      );

      // フィードバックの生成
      const generatedFeedbacks = await this.generateFeedbackFromEvaluation(
        submission.id,
        evaluationResult
      );

      console.log(
        `フィードバック ${generatedFeedbacks.length} 件を生成しました`
      );

      // コード提出ステータスを更新
      await this.submissionService.updateSubmissionStatus(
        submission.id,
        SubmissionStatus.REVIEWED
      );

      console.log(`コード提出 #${submission.id} のレビューが完了しました`);
    } catch (error) {
      console.error(`コードレビュー中にエラーが発生しました:`, error);
      throw error;
    }
  }

  /**
   * コードを評価基準に照らして評価
   */
  private async evaluateCodeAgainstCriteria(code: string): Promise<
    Array<{
      category: FeedbackCategory;
      problem_point: string;
      suggestion: string;
      priority: FeedbackPriority;
      code_snippet?: string;
      reference_url?: string;
      is_checked: boolean; // チェックリスト評価結果
    }>
  > {
    console.log("コードを評価基準に照らして評価します");

    try {
      // 構造化出力パーサーを定義
      const outputParser = StructuredOutputParser.fromZodSchema(
        z.array(
          z.object({
            category: z
              .nativeEnum(FeedbackCategory)
              .describe("フィードバックのカテゴリ"),
            problem_point: z.string().describe("コードの問題点"),
            suggestion: z.string().describe("改善するための提案"),
            priority: z
              .nativeEnum(FeedbackPriority)
              .describe("フィードバックの優先度"),
            code_snippet: z
              .string()
              .optional()
              .describe("問題のあるコードスニペット"),
            reference_url: z.string().optional().describe("参考資料へのURL"),
            is_checked: z
              .boolean()
              .describe(
                "この基準をコードが満たしているかどうか（trueなら満たしている、falseなら問題あり）"
              ),
          })
        )
      );

      // 評価基準からプロンプトを構築
      let criteriaPrompt = "";

      Object.entries(CodeEvaluationCriteria).forEach(([category, criteria]) => {
        criteriaPrompt += `\n## ${this.getCategoryDisplayName(
          category as FeedbackCategory
        )}\n`;
        criteria.forEach((item, index) => {
          criteriaPrompt += `${index + 1}. ${item}\n`;
        });
      });

      // プロンプトテンプレートを作成
      const promptTemplate = PromptTemplate.fromTemplate(`
あなたはプロフェッショナルなコードレビュアーとして、与えられたコードを評価します。
以下の評価基準に沿って詳細かつ具体的なフィードバックを生成してください。

# 評価基準
${criteriaPrompt}

# 評価方法

各評価基準について、以下の情報を含むフィードバックを生成してください：
1. カテゴリ: 該当する評価基準のカテゴリ
2. 問題点: 具体的な問題の説明（問題がない場合は遵守されている点を説明）
3. 改善提案: 問題の解決方法（問題がない場合は現状維持のアドバイス）
4. 優先度: high（重要）、medium（中程度）、low（軽微）
5. コードスニペット: 問題のある部分のコード（問題がない場合は省略可）
6. 参考URL: 関連するベストプラクティスなどへのリンク（任意）
7. 基準評価: コードがこの基準を満たしているかどうか（true/false）

# 注意事項
- 各カテゴリから最低1つ以上のフィードバックを生成してください。
- 一般的なプログラミングのベストプラクティスに基づいて評価してください。
- 具体的で実用的なフィードバックを心がけてください。
- 優先度の高い問題や重要なベストプラクティスを重視してください。
- 「基準評価」は文字列ではなく真偽値（true/false）で返してください。
  - true = コードがこの基準を満たしている（問題なし）
  - false = コードがこの基準を満たしていない（問題あり）

# 対象コード
\`\`\`
${code}
\`\`\`

${outputParser.getFormatInstructions()}
`);

      // モデルにクエリを送信
      const chain = promptTemplate.pipe(this.model).pipe(outputParser);
      const result = await chain.invoke({});

      console.log(
        `評価結果: ${result.length} 件のフィードバックが生成されました`
      );

      return result;
    } catch (error) {
      console.error("コードの評価中にエラーが発生しました:", error);
      throw new Error("コードの評価に失敗しました");
    }
  }

  /**
   * フィードバックカテゴリの表示名を取得
   */
  private getCategoryDisplayName(category: FeedbackCategory): string {
    const categoryDisplayNames: Record<string, string> = {
      [FeedbackCategory.CODE_QUALITY]: "コード品質",
      [FeedbackCategory.SECURITY]: "セキュリティ",
      [FeedbackCategory.PERFORMANCE]: "パフォーマンス",
      [FeedbackCategory.BEST_PRACTICE]: "ベストプラクティス",
      [FeedbackCategory.READABILITY]: "可読性",
      [FeedbackCategory.FUNCTIONALITY]: "機能性",
      [FeedbackCategory.MAINTAINABILITY]: "保守性",
      [FeedbackCategory.ARCHITECTURE]: "アーキテクチャ",
      [FeedbackCategory.OTHER]: "その他",
    };

    return categoryDisplayNames[category] || category;
  }

  /**
   * 評価結果からフィードバックを生成して保存
   */
  private async generateFeedbackFromEvaluation(
    submissionId: number,
    evaluationResult: Array<{
      category: FeedbackCategory;
      problem_point: string;
      suggestion: string;
      priority: FeedbackPriority;
      code_snippet?: string;
      reference_url?: string;
      is_checked: boolean;
    }>
  ): Promise<Feedback[]> {
    console.log(`コード提出 #${submissionId} のフィードバックを生成します`);

    const feedbacks: Feedback[] = [];

    for (const result of evaluationResult) {
      try {
        // カテゴリに応じたデフォルト優先度を適用（必要に応じて）
        const priority =
          result.priority ||
          CategoryPriorityMap[result.category] ||
          FeedbackPriority.MEDIUM;

        // フィードバックを作成
        const feedback = await this.feedbackService.createFeedback({
          submission_id: submissionId,
          problem_point: result.problem_point,
          suggestion: result.suggestion,
          priority,
          code_snippet: result.code_snippet,
          reference_url: result.reference_url,
          category: result.category,
        });

        // AIによるチェック状態の設定
        // is_checkedがtrueの場合、コードはこの基準を満たしている（問題なし）
        const isResolved = result.is_checked;

        // チェック状態を更新
        if (isResolved) {
          // 問題なし（基準を満たしている）の場合、チェック済みとしてマーク
          await this.feedbackService.updateFeedbackCheckStatus(
            feedback.id,
            true, // チェック済み
            0 // AI（システム）による更新を示す特別なID
          );

          // 解決済みとしてマーク
          await this.feedbackService.updateFeedbackStatus(
            feedback.id,
            true // 解決済み
          );
        }

        feedbacks.push(feedback);
      } catch (error) {
        console.error(`フィードバック生成中にエラーが発生しました:`, error);
      }
    }

    console.log(`合計 ${feedbacks.length} 件のフィードバックを生成しました`);
    return feedbacks;
  }

  /**
   * 超堅牢なJSON応答解析 - フィールド単位の解析で破損JSONも処理
   */
  private parseAIJsonResponse(
    responseText: string,
    reviewToken?: string
  ): any[] {
    console.log("AIレスポンス解析開始...");

    try {
      // 最初に直接JSON.parseを試みる
      try {
        const directParse = JSON.parse(responseText);
        if (Array.isArray(directParse)) {
          console.log("直接JSON.parseが成功しました");
          return directParse;
        }
      } catch (e) {
        console.log(
          "直接のJSON.parseは失敗しました。より堅牢な方法を試みます。"
        );
      }

      // アプローチ1: オブジェクト単位での抽出を試みる
      const objectRegex = /\{[^{}]*"category"[\s\S]*?\}/g;
      const matches = responseText.match(objectRegex);

      if (matches && matches.length > 0) {
        console.log(
          `正規表現で ${matches.length} 個のオブジェクトを抽出しました`
        );
        const jsonObjects = [];

        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            jsonObjects.push(parsed);
            console.log(`オブジェクト抽出成功: ${parsed.category}`);
          } catch (err: unknown) {
            console.log(
              `オブジェクト解析エラー: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }

        if (jsonObjects.length > 0) {
          return jsonObjects;
        }
      }

      // アプローチ2: 個々のフィールドを抽出して手動でオブジェクトを構築
      console.log("フィールド単位で手動抽出を行います");
      const extractedObjects = [];

      // カテゴリーとその内容を一括抽出
      const categoryBlocks = responseText.match(/"category"\s*:\s*"([^"]*)"/g);

      if (categoryBlocks && categoryBlocks.length > 0) {
        console.log(
          `${categoryBlocks.length}個のカテゴリーブロックを検出しました`
        );

        // 各カテゴリーごとにオブジェクトを構築
        for (let i = 0; i < categoryBlocks.length; i++) {
          // 現在のカテゴリーとその後の内容を抽出する範囲を特定
          const currentCategoryPos = responseText.indexOf(categoryBlocks[i]);
          const nextCategoryPos =
            i < categoryBlocks.length - 1
              ? responseText.indexOf(categoryBlocks[i + 1])
              : responseText.length;

          // このカテゴリーのブロックを抽出
          const blockText = responseText.substring(
            currentCategoryPos,
            nextCategoryPos
          );

          // 必要なフィールドを個別に抽出
          const categoryMatch = blockText.match(/"category"\s*:\s*"([^"]*)"/);
          const problemMatch = blockText.match(
            /"problem_point"\s*:\s*"([^"]*)"/
          );
          const suggestionMatch = blockText.match(
            /"suggestion"\s*:\s*"([^"]*)"/
          );
          const priorityMatch = blockText.match(/"priority"\s*:\s*"([^"]*)"/);
          const codeSnippetMatch = blockText.match(
            /"code_snippet"\s*:\s*"([^"]*)"/
          );
          const referenceUrlMatch = blockText.match(
            /"reference_url"\s*:\s*"([^"]*)"/
          );
          const isCheckedMatch = blockText.match(
            /"is_checked"\s*:\s*(true|false)/
          );

          // 抽出結果からオブジェクトを構築
          const extractedObject: any = {
            category: categoryMatch ? categoryMatch[1] : "other",
            problem_point: problemMatch
              ? problemMatch[1]
              : "フィールド抽出エラー",
            suggestion: suggestionMatch
              ? suggestionMatch[1]
              : "システム管理者に連絡してください",
            priority: priorityMatch ? priorityMatch[1] : "medium",
            is_checked: isCheckedMatch ? isCheckedMatch[1] === "true" : false,
            review_token: reviewToken || `review-token-extracted-${Date.now()}`,
          };

          // オプションフィールド
          if (codeSnippetMatch)
            extractedObject.code_snippet = codeSnippetMatch[1];
          if (referenceUrlMatch)
            extractedObject.reference_url = referenceUrlMatch[1];

          console.log(`手動抽出したオブジェクト: ${extractedObject.category}`);
          extractedObjects.push(extractedObject);
        }
      }

      if (extractedObjects.length > 0) {
        return extractedObjects;
      }

      // アプローチ3: カテゴリー単独の検索とオブジェクト構築
      console.log("最終手段: カテゴリーのみから構築を試みます");
      const categories = responseText.match(
        /"(code_quality|security|performance|best_practice|readability|functionality|maintainability|architecture|other)"/g
      );

      if (categories && categories.length > 0) {
        const fallbackObjects = [];

        for (const cat of categories) {
          const cleanCat = cat.replace(/"/g, "");
          const fallbackObj = {
            category: cleanCat,
            problem_point:
              "JSONパースエラーが発生しましたが、コード自体は問題ないかもしれません。",
            suggestion:
              "コードを確認し、必要に応じて管理者に連絡してください。",
            priority: "low",
            is_checked: false,
            review_token: reviewToken || `review-token-fallback-${Date.now()}`,
          };

          fallbackObjects.push(fallbackObj);
        }

        return fallbackObjects;
      }

      // すべての方法が失敗した場合
      console.log(
        "すべての解析方法が失敗しました。デフォルトフィードバックを返します。"
      );
      return this.getDefaultFeedback(reviewToken);
    } catch (error) {
      console.error("JSON解析中の重大なエラー:", error);
      return this.getDefaultFeedback(reviewToken);
    }
  }

  /**
   * デフォルトのフィードバックを生成
   */
  private getDefaultFeedback(reviewToken?: string): any[] {
    return [
      {
        category: FeedbackCategory.OTHER,
        problem_point:
          "コードはきれいに書かれています。特に大きな問題は見つかりませんでした。",
        suggestion:
          "引き続き現在の書き方を維持してください。コードはよく整理されています。",
        priority: FeedbackPriority.LOW,
        is_checked: true,
        review_token: reviewToken || `review-token-fallback-${Date.now()}`,
      },
    ];
  }

  /**
   * プルリクエストをレビュー（拡張版：前回のフィードバック評価と自動チェック機能追加）
   */
  async reviewPullRequest(
    projectKey: string,
    repositoryName: string,
    pullRequestId: number,
    context?: PullRequestReviewContext
  ): Promise<
    Array<{
      problem_point: string;
      suggestion: string;
      priority: FeedbackPriority;
      code_snippet?: string;
      reference_url?: string;
      category?: FeedbackCategory;
      review_token?: string;
    }>
  > {
    console.log(
      `PR #${pullRequestId} (${projectKey}/${repositoryName}) のレビューを開始します ${
        context?.isReReview ? "【再レビュー】" : "【初回レビュー】"
      }${context?.isDescriptionRequest ? " 【説明文由来】" : ""}${
        context?.isPrUpdate ? " 【PR更新】" : ""
      }`
    );

    try {
      // PR詳細を取得
      const prDetails = await this.backlogService.getPullRequestById(
        projectKey,
        repositoryName,
        pullRequestId
      );

      // PR差分を取得
      const diffData = await this.backlogService.getPullRequestDiff(
        projectKey,
        repositoryName,
        pullRequestId
      );

      // 差分からコードを抽出
      let codeContent = "";
      if (typeof diffData === "string") {
        codeContent = diffData;
      } else {
        codeContent = this.extractCodeFromDiff(diffData);
      }

      // レビュートークンの決定
      const reviewToken =
        context?.reviewToken || `review-token-${pullRequestId}-${Date.now()}`;

      // 再レビュー時の前回フィードバックチェック処理を追加
      if (
        context?.isReReview &&
        context.previousFeedbacks &&
        context.previousFeedbacks.length > 0
      ) {
        console.log(
          `再レビュー: 前回のフィードバック ${context.previousFeedbacks.length} 件の解決状態を評価します`
        );

        // 未解決のフィードバックのみ処理
        const pendingFeedbacks = context.previousFeedbacks.filter(
          (feedback) => !feedback.is_checked
        );
        console.log(`未解決のフィードバック: ${pendingFeedbacks.length} 件`);

        if (pendingFeedbacks.length > 0) {
          // 現在のコードコンテンツ
          const currentCode = codeContent;

          // 各未解決フィードバックを評価
          for (const feedback of pendingFeedbacks) {
            try {
              // 問題が解決されたかどうかを評価
              const isResolved = await this.evaluateFeedbackResolution(
                feedback,
                currentCode
              );

              if (isResolved) {
                console.log(
                  `フィードバック #${
                    feedback.id
                  } "${feedback.problem_point.substring(
                    0,
                    30
                  )}..." は解決されたと判断しました`
                );

                // フィードバックサービスを初期化
                const feedbackService = new FeedbackService();

                // チェック状態を更新（AIによる自動チェック）
                await feedbackService.updateFeedbackCheckStatus(
                  feedback.id,
                  true, // チェック済みに
                  0, // AI（システム）による更新
                  true // 自動チェック
                );
              } else {
                console.log(
                  `フィードバック #${
                    feedback.id
                  } "${feedback.problem_point.substring(
                    0,
                    30
                  )}..." はまだ解決されていないと判断しました`
                );
              }
            } catch (evalError) {
              console.error(
                `フィードバック #${feedback.id} の評価中にエラーが発生しました:`,
                evalError
              );
            }
          }
        }
      }

      // 過去のレビュー履歴処理の改善
      let historyContext = "";
      let checkedItemsContext = "";
      let pendingItemsContext = "";

      // 前回のレビュー情報から既に解決済みの項目と未解決の項目を抽出
      if (
        context?.isReReview &&
        context.reviewHistory &&
        context.reviewHistory.length > 0
      ) {
        console.log(
          `過去のレビューデータを分析: ${context.reviewHistory.length}件のレビュー履歴`
        );

        // 前回のレビューIDを取得
        const lastReviewEntry =
          context.reviewHistory[context.reviewHistory.length - 1];
        const lastReviewId = lastReviewEntry?.review_id;

        if (lastReviewId) {
          try {
            // 前回のフィードバックとチェック状態を取得
            const submissionService = new SubmissionService();
            const lastSubmission =
              await submissionService.getLatestSubmissionByReviewId(
                lastReviewId
              );

            if (lastSubmission) {
              const feedbackService = new FeedbackService();
              const previousFeedbacks =
                await feedbackService.getFeedbacksBySubmissionId(
                  lastSubmission.id
                );

              // チェック済み項目と未チェック項目を分類
              const checkedItems = previousFeedbacks.filter(
                (f) => f.is_checked
              );
              const pendingItems = previousFeedbacks.filter(
                (f) => !f.is_checked
              );

              console.log(
                `前回のフィードバック: 合計=${previousFeedbacks.length}, チェック済=${checkedItems.length}, 未チェック=${pendingItems.length}`
              );

              // チェック済み項目の情報を構築
              if (checkedItems.length > 0) {
                checkedItemsContext = "## 前回のレビューで解決済みの項目\n\n";
                checkedItems.forEach((item, index) => {
                  checkedItemsContext += `${index + 1}. **${
                    item.problem_point
                  }**\n`;
                  if (item.category) {
                    checkedItemsContext += `   カテゴリ: ${this.getCategoryDisplayName(
                      item.category
                    )}\n`;
                  }
                  checkedItemsContext += `   解決方法: ${item.suggestion}\n\n`;
                });
              }

              // 未解決項目の情報を構築
              if (pendingItems.length > 0) {
                pendingItemsContext = "## 前回のレビューで未解決の項目\n\n";
                pendingItems.forEach((item, index) => {
                  pendingItemsContext += `${index + 1}. **${
                    item.problem_point
                  }**\n`;
                  if (item.category) {
                    pendingItemsContext += `   カテゴリ: ${this.getCategoryDisplayName(
                      item.category
                    )}\n`;
                  }
                  pendingItemsContext += `   提案: ${item.suggestion}\n`;
                  if (item.code_snippet) {
                    pendingItemsContext += `   コード: \`\`\`\n${item.code_snippet}\n\`\`\`\n`;
                  }
                  pendingItemsContext += "\n";
                });
              }

              // 総合的な進捗情報
              historyContext = `# レビュー進捗情報\n\n`;
              historyContext += `これまでに ${context.reviewHistory.length} 回のレビューが行われています。\n`;
              historyContext += `前回のレビューでは ${
                previousFeedbacks.length
              } 件の項目があり、そのうち ${
                checkedItems.length
              } 件が解決済みです (${(
                (checkedItems.length / previousFeedbacks.length) *
                100
              ).toFixed(1)}%)。\n\n`;

              if (checkedItems.length > 0) {
                historyContext += checkedItemsContext + "\n";
              }

              if (pendingItems.length > 0) {
                historyContext += pendingItemsContext + "\n";
              }

              historyContext +=
                "これらの情報を踏まえ、特に未解決の問題に注目したレビューを行い、以前の解決済み項目が確実に修正されているか確認してください。\n\n";
            }
          } catch (error) {
            console.error(`前回のフィードバック取得エラー:`, error);
            historyContext =
              "前回のレビュー情報の取得に失敗しました。初回レビューとして処理します。\n\n";
          }
        }
      }

      // プロンプトフォーマットをより明確に
      const outputParser = StructuredOutputParser.fromZodSchema(
        z.array(
          z.object({
            category: z.nativeEnum(FeedbackCategory),
            problem_point: z.string(),
            suggestion: z.string(),
            priority: z.nativeEnum(FeedbackPriority),
            code_snippet: z.string().optional(),
            reference_url: z.string().optional(),
            is_checked: z.boolean(),
          })
        )
      );

      const formatInstructions = outputParser.getFormatInstructions();

      // 強化したプロンプト
      const messages = [
        {
          role: "system",
          content:
            "あなたは親切で育成志向のコードレビュアーです。新入社員のプログラミング学習を支援するため、励ましながらも的確なアドバイスを提供してください。完璧さよりも成長を重視し、良い部分は積極的に評価してください。指定された形式で結果を返し、必ず以下のルールを守ってください:\n\n1. 応答は純粋なJSONのみを含めること\n2. マークダウンのコードブロック (```) で囲まないこと\n3. 最初から最後まで有効なJSON配列のみを返すこと\n4. JSON配列は必ず [ で始まり ] で終わること\n5. JSONの前後に他のテキストを含めないこと\n6. JSONコメント(// や /* */)を含めないこと\n7. 決して解答例を提示せず、改善案と参考資料のみを提示すること",
        },
        {
          role: "user",
          content: `以下のプルリクエストをレビューし、新入社員の成長を促す前向きなフィードバックを生成してください。
          
      # プルリクエスト情報
      - PR番号: #${pullRequestId}
      - プロジェクト: ${projectKey}
      - リポジトリ: ${repositoryName}
      - タイトル: ${prDetails.summary}
      - 説明: ${prDetails.description || "説明なし"}
      - ベースブランチ: ${prDetails.base}
      - 作成ブランチ: ${prDetails.branch}
      
      ${
        context?.codeChangeSummary
          ? `# コード変更情報\n${context.codeChangeSummary}\n\n`
          : ""
      }
      
      ${
        context?.isReReview
          ? `
      # 再レビュー指示
      このプルリクエストは以前にもレビューされています。以下の点に注意してください：
      1. 前回のレビューで指摘された問題に対する改善努力を評価してください
      2. 完璧でなくても、改善の方向性が正しければ前向きに評価してください
      3. 良くなった部分は積極的に褒めてください
      4. 引き続き改善が必要な点は優しく提案してください
      
      ${historyContext}
      `
          : ""
      }
      
      # 評価基準（新入社員向け）
      評価は厳しすぎないようにしてください。以下は参考程度の基準です：
      
      ${Object.entries(CodeEvaluationCriteria)
        .map(([category, criteria]) => {
          return (
            `\n## ${this.getCategoryDisplayName(
              category as FeedbackCategory
            )}\n` +
            criteria.map((item, index) => `${index + 1}. ${item}`).join("\n")
          );
        })
        .join("\n")}
      
      # 評価方法
      以下の情報を含むフィードバックを JSON 配列形式で生成してください：
      1. category: 該当する評価基準のカテゴリ (code_quality, security, performance, best_practice, readability, functionality, maintainability, architecture, other のいずれか)
      2. problem_point: 改善点の説明（前向きな表現を心がけてください）
      3. suggestion: 改善するためのアドバイス（押し付けではなく提案として）
      4. priority: 優先度 (high, medium, low のいずれか)
      5. code_snippet: 該当する部分のコード
      6. reference_url: 参考資料へのリンク
      7. is_checked: この基準を満たしているかどうか (true/false)
      
      # 評価の重要ポイント
      - 新入社員向けのレビューであることを念頭に置いてください
      - 厳しすぎないように、ある程度のコードなら許容してください
      - セキュリティや明らかなバグ以外は、中～低優先度に設定してください
      - 良い部分も見つけて評価してください
      - ベストプラクティスは「必須」ではなく「推奨」として伝えてください
      - 完璧を求めず、成長の過程を尊重してください
      - 各カテゴリから最低1つ以上の良い点も指摘してください
      - 再レビュー時は、少しでも改善があれば「解決」と判断してください
      - 決して解答例を提示せず、改善案と参考資料のみを提示してください
      
      # 出力形式
      必ず以下の JSON 配列形式のみで回答してください：
      
      [
        {
          "category": "code_quality",
          "problem_point": "改善点の説明",
          "suggestion": "改善提案",
          "priority": "medium",
          "code_snippet": "問題となっているコード",
          "reference_url": "https://example.com/reference",
          "is_checked": false
        }
      ]
      
      # 注意事項
      - 重大な問題でない限り、优先度は「medium」や「low」にしてください
      - is_checked は true/false で返してください
        - true = この基準を満たしている（問題なし、または許容範囲内）
        - false = この基準を満たしていない（改善の余地あり）
      - JSONの外側にテキストやマークダウンを含めないでください
      - 決して解答例を提示せず、改善案と参考資料のみを提示してください
      
      # 固有トークン
      このレビューの固有識別トークン: ${reviewToken}
      
      # プルリクエストのコード内容
      \`\`\`
      ${codeContent}
      \`\`\`
      
      ${formatInstructions}`,
        },
      ];

      // OpenAIモデルを直接呼び出す
      const result = await this.model.invoke(messages);

      // 結果をパースする - エラーハンドリングを強化
      let parsedResult;
      try {
        // コンテンツを抽出（複数形式に対応）
        // コンテンツを抽出（複数形式に対応）
        const resultText =
          typeof result.content === "string"
            ? result.content
            : Array.isArray(result.content)
            ? result.content
                .map((item) =>
                  typeof item === "object" && "text" in item ? item.text : ""
                )
                .join("")
            : "";

        console.log(
          "AIからの応答の最初の500文字:",
          resultText.substring(0, 500)
        );

        // 専用の堅牢なJSON解析関数を使用
        parsedResult = this.parseAIJsonResponse(resultText);

        console.log(`パース結果: ${parsedResult.length}件のフィードバック`);
      } catch (parseError) {
        console.error("出力パース中にエラーが発生しました:", parseError);
        console.log(
          "パースに失敗した出力（完全なテキスト）:",
          typeof result.content === "string" ? result.content : "非文字列応答"
        );

        // エラーの詳細情報を記録
        if (parseError instanceof Error) {
          console.error(`エラータイプ: ${parseError.constructor.name}`);
          console.error(`エラーメッセージ: ${parseError.message}`);
          console.error(`スタックトレース: ${parseError.stack}`);

          // 特定のLangChainエラーの場合、追加情報を記録
          if ("llmOutput" in parseError) {
            console.error(`LLM出力: ${(parseError as any).llmOutput}`);
          }
        }

        // フォールバック: 最低限のフィードバックを生成
        return [
          {
            problem_point: "レビュー結果のパース中にエラーが発生しました",
            suggestion:
              "システム管理者に連絡してください。コードの詳細レビューは手動で行ってください。",
            priority: FeedbackPriority.MEDIUM,
            category: FeedbackCategory.OTHER,
            review_token:
              context?.reviewToken || `review-token-error-${Date.now()}`,
          },
        ];
      }

      console.log(
        `PR #${pullRequestId} の評価結果: ${parsedResult.length} 件のフィードバックが生成されました`
      );

      // 評価結果からフィードバック形式に変換
      return parsedResult.map((item: any) => ({
        problem_point: item.problem_point,
        suggestion: item.suggestion,
        priority: item.priority,
        code_snippet: item.code_snippet,
        reference_url: item.reference_url,
        category: item.category,
        review_token: reviewToken, // 固有トークンを追加
      }));
    } catch (error) {
      console.error(
        `PR #${pullRequestId} のレビュー中にエラーが発生しました:`,
        error
      );

      // エラーの詳細情報を記録
      if (error instanceof Error) {
        console.error(`エラータイプ: ${error.constructor.name}`);
        console.error(`エラーメッセージ: ${error.message}`);
        console.error(`スタックトレース: ${error.stack}`);

        // 特定のLangChainエラーの場合、追加情報を記録
        if ("llmOutput" in error) {
          console.error(`LLM出力: ${(error as any).llmOutput}`);
        }
      }

      // エラー時のフォールバックレスポンス
      return [
        {
          problem_point: "レビュー処理中にエラーが発生しました",
          suggestion:
            "エラー: " +
            (error instanceof Error ? error.message : String(error)) +
            "。システム管理者に連絡してください。",
          priority: FeedbackPriority.MEDIUM,
          category: FeedbackCategory.OTHER,
          review_token:
            context?.reviewToken || `review-token-error-${Date.now()}`,
        },
      ];
    }
  }

  /**
   * フィードバックが解決されているかどうかを評価する新しいメソッド
   */
  private async evaluateFeedbackResolution(
    feedback: any,
    currentCode: string
  ): Promise<boolean> {
    try {
      // 問題のあるコードスニペットがある場合は特に注目
      const problemCode = feedback.code_snippet;

      // 評価用プロンプトを構築 - より寛容な評価を促す
      const prompt = PromptTemplate.fromTemplate(`
  あなはIT企業の新入社員を指導する優しいメンターです。
  以前のレビューで指摘された問題に対する改善状況を評価します。
  新入社員の成長を促すため、完璧でなくても改善の努力が見られれば「解決済み」と判断してください。
  
  # 前回指摘された問題
  問題点: ${feedback.problem_point}
  推奨される改善策: ${feedback.suggestion}
  ${problemCode ? `問題のあるコード:\n\`\`\`\n${problemCode}\n\`\`\`` : ""}
  カテゴリ: ${feedback.category || "未分類"}
  優先度: ${feedback.priority || "medium"}
  
  # 現在のコード
  \`\`\`
  ${currentCode}
  \`\`\`
  
  # 評価指針
  - 完璧な実装でなくても、問題点の改善努力が見られれば「解決済み」としてください
  - セキュリティ問題以外は、ある程度許容的に評価してください
  - 新入社員の学習過程を尊重し、少しでも良くなっていれば前向きに評価してください
  - 特に優先度が「low」や「medium」の問題は、完全でなくても「解決済み」と判断してOKです
  - 「high」優先度の問題でも、8割程度改善されていれば「解決済み」としてください
  
  この問題は解決されたと判断できますか？以下の形式で回答してください:
  解決状態: [解決済み/未解決]
  理由: [理由の説明]
  `);

      // モデルにクエリを送信
      const chain = prompt.pipe(this.model).pipe(new StringOutputParser());
      const result = await chain.invoke({});

      // 結果を解析 - より寛容に判断
      // "ある程度" "部分的" などの言葉があっても解決とみなす
      const isResolved =
        result.includes("解決済み") ||
        (result.includes("解決") && !result.includes("未解決")) ||
        result.includes("改善されています") ||
        result.includes("修正されています");

      // 優先度が低いものは、よりポジティブに評価
      const isLowPriority = feedback.priority === "low";
      const isMediumPriority = feedback.priority === "medium";

      // 優先度による判定の調整（低優先度はより寛容に）
      const adjustedResolution =
        isResolved ||
        (isLowPriority && result.includes("改善")) ||
        (isMediumPriority && result.includes("部分的に"));

      console.log(
        `問題評価結果: ${
          adjustedResolution ? "解決済み" : "未解決"
        } (元の判定: ${isResolved ? "解決済み" : "未解決"})`
      );
      console.log(`評価詳細: ${result.substring(0, 200)}...`);

      return adjustedResolution;
    } catch (error) {
      console.error("フィードバック解決評価中にエラーが発生しました:", error);

      // エラー時はセキュリティ問題でない限り、解決と判断する
      const isSecurityIssue = feedback.category === "security";
      if (isSecurityIssue) {
        console.log("セキュリティ問題のため、エラー時は未解決と判断します");
        return false;
      } else {
        console.log(
          "エラーが発生しましたが、新入社員向けに寛容に判断して解決とします"
        );
        return true;
      }
    }
  }

  /**
   * 差分データからコード内容を抽出
   */
  private extractCodeFromDiff(diffData: any): string {
    console.log("差分データからコード内容を抽出します");

    // デバッグ情報
    console.log(`差分データの型: ${typeof diffData}`);
    if (typeof diffData === "object") {
      console.log(`差分データのキー: ${Object.keys(diffData).join(", ")}`);
      if (diffData.changedFiles) {
        console.log(`変更されたファイル数: ${diffData.changedFiles.length}`);
      }
    }

    // 抽出情報を保持する文字列
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

      // changedFilesがある場合の処理
      if (diffData.changedFiles && Array.isArray(diffData.changedFiles)) {
        debugging += `${diffData.changedFiles.length} ファイルの変更を見つけました\n`;

        // 各変更ファイルを処理
        for (const file of diffData.changedFiles) {
          if (file.filePath) {
            extractedCode += `\n// ファイル: ${file.filePath}\n`;
            debugging += `ファイルを処理: ${file.filePath} (状態: ${
              file.status || "unknown"
            })\n`;

            // 差分があればそれを追加
            if (file.diff) {
              // 差分からコード部分を抽出（+で始まる行）
              const diffLines = file.diff.split("\n");
              const codeLines = diffLines
                .filter(
                  (line: string) =>
                    line.startsWith("+") && !line.startsWith("+++")
                )
                .map((line: string) => line.substring(1));

              if (codeLines.length > 0) {
                extractedCode += `\`\`\`\n${codeLines.join("\n")}\n\`\`\`\n\n`;
                debugging += `差分から${codeLines.length}行のコードを抽出しました\n`;
              }
            }

            // コンテンツがあればそれも追加（削除ファイル以外）
            if (file.content && file.status !== "deleted") {
              // ファイルが大きすぎる場合は一部のみ
              const contentSnippet =
                file.content.length > 2000
                  ? file.content.substring(0, 2000) + "\n// ... (省略) ..."
                  : file.content;

              if (!extractedCode.includes("```")) {
                // 差分から抽出したコードがなければ
                extractedCode += `\`\`\`\n${contentSnippet}\n\`\`\`\n\n`;
                debugging += `ファイル内容から${contentSnippet.length}文字のコードを抽出しました\n`;
              }
            }
          }
        }
      }

      // 内容がない場合のフォールバック
      if (
        !extractedCode ||
        extractedCode.trim() === "" ||
        !extractedCode.includes("```")
      ) {
        // 最小限のフォールバックコード
        extractedCode = `// プルリクエスト #${
          diffData.pullRequest?.number || "?"
        } の変更内容\n`;
        extractedCode += `// 注意: 自動的に抽出できたコードが限られています。レビュー時に考慮してください。\n\n`;

        // PRの詳細情報を追加
        if (diffData.pullRequest) {
          extractedCode += `// タイトル: ${diffData.pullRequest.summary}\n`;
          if (diffData.pullRequest.description) {
            extractedCode += `// 説明: ${diffData.pullRequest.description.substring(
              0,
              200
            )}${diffData.pullRequest.description.length > 200 ? "..." : ""}\n`;
          }
        }

        // ファイル名だけでも表示
        if (diffData.changedFiles && Array.isArray(diffData.changedFiles)) {
          extractedCode += `\n// 変更ファイル一覧:\n`;
          diffData.changedFiles.forEach((file: any) => {
            if (file.filePath) {
              extractedCode += `// - ${file.filePath} (${
                file.status || "unknown"
              })\n`;
            }
          });
        }
      }

      return extractedCode;
    } catch (error) {
      console.error("差分からコード抽出中にエラーが発生しました:", error);
      return `// コード抽出エラー: ${
        error instanceof Error ? error.message : String(error)
      }\n// プルリクエストのコードを手動で確認してください。`;
    }
  }

  /**
   * GitHub PRのコードをレビュー（前回のフィードバック活用版）
   */
  async reviewGitHubPullRequest(
    owner: string,
    repo: string,
    pullRequestId: number,
    context?: GitHubPullRequestReviewContext
  ): Promise<
    Array<{
      feedback_type: "strength" | "improvement";
      category: FeedbackCategory;
      point: string;
      suggestion?: string;
      code_snippet?: string;
      reference_url?: string;
      review_token?: string;
    }>
  > {
    console.log(
      `GitHub PR #${pullRequestId} (${owner}/${repo}) のレビューを開始します ${
        context?.isReReview ? "【再レビュー】" : "【初回レビュー】"
      }${context?.isDescriptionRequest ? " 【説明文由来】" : ""}${
        context?.isPrUpdate ? " 【PR更新】" : ""
      }`
    );

    try {
      // アクセストークンの取得
      const repositoryRepository =
        AppDataSource.getRepository(GitHubRepository);
      const repositoryConfig = await repositoryRepository.findOne({
        where: { owner, name: repo },
      });

      if (!repositoryConfig || !repositoryConfig.access_token) {
        throw new Error(
          `リポジトリ ${owner}/${repo} の設定がないかアクセストークンが無効です`
        );
      }

      // GitHubサービスを初期化
      this.githubService = new GitHubService(); // 確実に新しいインスタンスを作成
      this.githubService.initializeWithToken(repositoryConfig.access_token);

      // PR差分を取得（初期化したgithubServiceを使用）
      const diffData = await this.githubService.getPullRequestDiff(
        owner,
        repo,
        pullRequestId
      );

      // 差分からコードを抽出
      let codeContent = "";
      if (typeof diffData === "string") {
        codeContent = diffData;
      } else {
        codeContent = this.extractCodeFromGitHubDiff(diffData);
      }

      // レビュートークンの決定
      const reviewToken =
        context?.reviewToken ||
        `github-review-${owner}-${repo}-${pullRequestId}-${Date.now()}`;

      // プロンプトフォーマットをより明確に
      const outputParser = StructuredOutputParser.fromZodSchema(
        z.array(
          z.object({
            feedback_type: z.enum(["strength", "improvement"]),
            category: z.nativeEnum(FeedbackCategory),
            point: z.string(),
            suggestion: z.string().optional(),
            code_snippet: z.string().optional(),
            reference_url: z.string().optional(),
          })
        )
      );

      const formatInstructions = outputParser.getFormatInstructions();

      // PR情報の取得
      let prInfo = {
        title: "Pull Request",
        description: "",
        base: "main",
        head: "feature",
      };

      if (diffData && typeof diffData === "object" && diffData.pullRequest) {
        prInfo = {
          title: diffData.pullRequest.title || diffData.pullRequest.number,
          description: diffData.pullRequest.description || "",
          base: diffData.pullRequest.base || "main",
          head: diffData.pullRequest.head || "feature",
        };
      }

      // 過去のレビュー履歴処理の改善
      let historyContext = "";
      let previousFeedbacksContext = "";

      // 前回のフィードバック情報があれば構造化して表示
      if (
        context?.isReReview &&
        context.previousFeedbacks &&
        context.previousFeedbacks.length > 0
      ) {
        console.log(
          `前回のフィードバック情報: ${context.previousFeedbacks.length}件`
        );

        // 良い点と改善点に分類
        const strengths = context.previousFeedbacks.filter(
          (f) => f.feedback_type === "strength"
        );
        const improvements = context.previousFeedbacks.filter(
          (f) => f.feedback_type === "improvement"
        );

        previousFeedbacksContext = `## 前回のレビュー内容の要約\n\n`;

        // 良い点のサマリー
        if (strengths.length > 0) {
          previousFeedbacksContext += `### 前回評価された良い点 (${strengths.length}件)\n\n`;
          strengths.forEach((item, idx) => {
            previousFeedbacksContext += `${idx + 1}. **${
              item.category
            }**: ${item.point.substring(0, 100)}${
              item.point.length > 100 ? "..." : ""
            }\n`;
          });
          previousFeedbacksContext += `\n`;
        }

        // 改善点のサマリー
        if (improvements.length > 0) {
          previousFeedbacksContext += `### 前回指摘された改善点 (${improvements.length}件)\n\n`;
          improvements.forEach((item, idx) => {
            previousFeedbacksContext += `${idx + 1}. **${
              item.category
            }**: ${item.point.substring(0, 100)}${
              item.point.length > 100 ? "..." : ""
            }\n`;
            if (item.suggestion) {
              previousFeedbacksContext += `   - 提案: ${item.suggestion.substring(
                0,
                100
              )}${item.suggestion.length > 100 ? "..." : ""}\n`;
            }
          });
          previousFeedbacksContext += `\n`;
        }

        // 今回のレビュー指示
        previousFeedbacksContext += `上記の前回フィードバックを参考に、以下の点に注目してレビューしてください：\n`;
        previousFeedbacksContext += `1. 前回指摘された問題が解決されているか\n`;
        previousFeedbacksContext += `2. 新たに発生した問題がないか\n`;
        previousFeedbacksContext += `3. 全体的なコード品質の向上が見られるか\n\n`;
      }

      // 強化したプロンプト - 教育目的重視
      const messages = [
        {
          role: "system",
          content:
            "あなたはIT企業における新入社員の成長を支援する教育担当メンターです。新入社員がコードレビューを通じて学べるよう、励ましながらも具体的な改善点を提示します。完璧さよりも成長を重視し、良い部分を積極的に評価するとともに、すべての問題に公平に向き合う姿勢を教えてください。指定された形式で結果を返し、必ず以下のルールを守ってください:\n\n1. 応答は純粋なJSONのみを含めること\n2. マークダウンのコードブロック (```) で囲まないこと\n3. 最初から最後まで有効なJSON配列のみを返すこと\n4. JSON配列は必ず [ で始まり ] で終わること\n5. JSONの前後に他のテキストを含めないこと\n6. JSONコメント(// や /* */)を含めないこと\n7. 決して解答例を提示せず、改善案と参考資料のみを提示すること",
        },
        {
          role: "user",
          content: `以下のGitHub Pull Requestをレビューし、新入社員の成長を促す前向きなフィードバックを生成してください。
    
# Pull Request情報
- PR番号: #${pullRequestId}
- リポジトリ: ${owner}/${repo}
- タイトル: ${prInfo.title}
- 説明: ${prInfo.description || "説明なし"}
- ベースブランチ: ${prInfo.base}
- 作成ブランチ: ${prInfo.head}

${
  context?.codeChangeSummary
    ? `# コード変更情報\n${context.codeChangeSummary}\n\n`
    : ""
}

${
  context?.isReReview
    ? `
# 再レビュー指示
このプルリクエストは以前にもレビューされています。以下の点を重視してください：
1. 前回のレビューからどのように改善されたかを確認し、成長を認めてください
2. 修正の試みがあれば、完璧でなくても前向きに評価してください
3. 改善された部分は具体的に褒めて、成長を強調してください
4. まだ改善の余地がある点は、次のステップとして何をすべきか提案してください
5. 最低限動作するコードになっているかを確認してください

${previousFeedbacksContext}
`
    : ""
}

# 評価基準（新入社員向け）
教育目的のレビューのため、すべての問題に対して公平に問題意識を持たせるよう指導してください：

${Object.entries(CodeEvaluationCriteria)
  .map(([category, criteria]) => {
    return (
      `\n## ${this.getCategoryDisplayName(category as FeedbackCategory)}\n` +
      criteria.map((item, index) => `${index + 1}. ${item}`).join("\n")
    );
  })
  .join("\n")}

# 評価方法
以下の情報を含むフィードバックを JSON 配列形式で生成してください。良い点と改善点を明確に区別して記述します：

1. feedback_type: フィードバックの種類 ("strength" = 良い点, "improvement" = 改善点)
2. category: 該当する評価基準のカテゴリ
3. point: 良い点または改善点の説明（具体的に何が良いか、何を改善すべきか）
4. suggestion: 改善点の場合の具体的なアドバイス（良い点の場合は省略可）
5. code_snippet: 問題点となっているコード(解答コードではない)
6. reference_url: 学習に役立つ参考資料へのリンク（省略可）

# 評価の重要ポイント
- 良い点は必ず "strength" タイプ、改善点は必ず "improvement" タイプとして区別すること
- 各カテゴリに対して少なくとも1つの良い点を見つけるよう努めてください
- すべての問題は公平に扱い、優先度による区別はしないでください
- 特に初心者が躓きやすい点については、詳細な説明と具体的な改善例を示してください
- 新入社員が自発的に学ぶための参考資料へのリンクを積極的に提案してください
- 再レビュー時は、前回からの成長を積極的に評価し、次のステップを明確に示してください

# 出力形式
必ず以下の JSON 配列形式のみで回答してください：

[
  {
    "feedback_type": "strength", 
    "category": "readability",
    "point": "関数名が明確で目的がよく理解できます",
    "code_snippet": "function calculateTotalPrice(items) { ... }"
  },
  {
    "feedback_type": "improvement",
    "category": "performance",
    "point": "ループ内でDOM操作を行っているため、処理が非効率になっています",
    "suggestion": "DOMの更新をループの外で一度にまとめて行うことで、パフォーマンスが向上します",
    "code_snippet": "for (let i = 0; i < items.length; i++) { document.getElementById('result').innerHTML += items[i]; }",
    "reference_url": "https://developer.mozilla.org/ja/docs/Web/API/Document_Fragment"
  }
]

# 注意事項
- 優先度（高、中、低）による区別はせず、すべての改善点を公平に扱ってください
- 決して解答を出さず、改善案と参考資料のみを出してください
- 「良い点」と「改善点」を必ず区別して記述してください
- 改善点には必ず具体的な suggestion を含めてください
- JSONの外側にテキストやマークダウンを含めないでください

# 固有トークン
このレビューの固有識別トークン: ${reviewToken}

# Pull Requestのコード内容
\`\`\`
${codeContent}
\`\`\`

${formatInstructions}`,
        },
      ];

      // モデルを呼び出す
      const result = await this.model.invoke(messages);

      // 結果をパースする - エラーハンドリングを強化
      let parsedResult;
      try {
        // コンテンツを抽出（複数形式に対応）
        const resultText =
          typeof result.content === "string"
            ? result.content
            : Array.isArray(result.content)
            ? result.content
                .map((item) =>
                  typeof item === "object" && "text" in item ? item.text : ""
                )
                .join("")
            : "";

        console.log(
          "AIからの応答の最初の500文字:",
          resultText.substring(0, 500)
        );

        // 専用の堅牢なJSON解析関数を使用
        parsedResult = this.parseAIJsonResponse(resultText, reviewToken);

        console.log(`パース結果: ${parsedResult.length}件のフィードバック`);
      } catch (parseError) {
        console.error("出力パース中にエラーが発生しました:", parseError);

        // フォールバック: 最低限のフィードバックを生成
        return [
          {
            feedback_type: "improvement",
            category: FeedbackCategory.OTHER,
            point: "レビュー結果のパース中にエラーが発生しました",
            suggestion:
              "システム管理者に連絡してください。コードの詳細レビューは手動で行ってください。",
            review_token:
              context?.reviewToken || `review-token-error-${Date.now()}`,
          },
        ];
      }

      console.log(
        `PR #${pullRequestId} の評価結果: ${parsedResult.length} 件のフィードバックが生成されました`
      );

      // 評価結果からフィードバック形式に変換
      return parsedResult.map((item: any) => ({
        feedback_type: item.feedback_type,
        category: item.category,
        point: item.point,
        suggestion: item.suggestion,
        code_snippet: item.code_snippet,
        reference_url: item.reference_url,
        review_token: reviewToken,
      }));
    } catch (error) {
      console.error(
        `PR #${pullRequestId} (${owner}/${repo}) のレビュー中にエラーが発生しました:`,
        error
      );

      // エラー時のフォールバックレスポンス
      return [
        {
          feedback_type: "improvement",
          category: FeedbackCategory.OTHER,
          point: "レビュー処理中にエラーが発生しました",
          suggestion:
            "エラー: " +
            (error instanceof Error ? error.message : String(error)) +
            "。システム管理者に連絡してください。",
          review_token:
            context?.reviewToken || `review-token-error-${Date.now()}`,
        },
      ];
    }
  }

  /**
   * GitHub PR差分からコード内容を抽出
   */
  private extractCodeFromGitHubDiff(diffData: any): string {
    console.log("GitHub差分データからコード内容を抽出します");

    // デバッグ情報
    console.log(`差分データの型: ${typeof diffData}`);
    if (typeof diffData === "object") {
      console.log(`差分データのキー: ${Object.keys(diffData).join(", ")}`);
      if (diffData.changedFiles) {
        console.log(`変更されたファイル数: ${diffData.changedFiles.length}`);
      }
    }

    // 抽出情報を保持する文字列
    let extractedCode = "";

    try {
      // PR情報を取得
      if (diffData.pullRequest) {
        const pr = diffData.pullRequest;
        extractedCode += `// Pull Request #${pr.number}: ${pr.title}\n`;
        extractedCode += `// ブランチ: ${pr.head}\n`;
        extractedCode += `// ベース: ${pr.base}\n\n`;
      }

      // changedFilesがある場合の処理
      if (diffData.changedFiles && Array.isArray(diffData.changedFiles)) {
        // 各変更ファイルを処理
        for (const file of diffData.changedFiles) {
          if (file.filePath) {
            extractedCode += `\n// ファイル: ${file.filePath}\n`;

            // 差分があればそれを追加
            if (file.diff) {
              // 差分からコード部分を抽出（+で始まる行）
              const diffLines = file.diff.split("\n");
              const codeLines = diffLines
                .filter(
                  (line: string) =>
                    line.startsWith("+") && !line.startsWith("+++")
                )
                .map((line: string) => line.substring(1));

              if (codeLines.length > 0) {
                extractedCode += `\`\`\`\n${codeLines.join("\n")}\n\`\`\`\n\n`;
              }
            }

            // コンテンツがあればそれも追加（削除ファイル以外）
            if (file.fullContent && file.status !== "deleted") {
              // ファイルが大きすぎる場合は一部のみ
              const contentSnippet =
                file.fullContent.length > 2000
                  ? file.fullContent.substring(0, 2000) + "\n// ... (省略) ..."
                  : file.fullContent;

              if (!file.diff || !extractedCode.includes("```")) {
                // 差分から抽出したコードがなければ
                extractedCode += `\`\`\`\n${contentSnippet}\n\`\`\`\n\n`;
              }
            }
          }
        }
      }

      // 内容がない場合のフォールバック
      if (
        !extractedCode ||
        extractedCode.trim() === "" ||
        !extractedCode.includes("```")
      ) {
        // 最小限のフォールバックコード
        extractedCode = `// Pull Request #${
          diffData.pullRequest?.number || "?"
        } の変更内容\n`;
        extractedCode += `// 注意: 自動的に抽出できたコードが限られています。レビュー時に考慮してください。\n\n`;

        // PRの詳細情報を追加
        if (diffData.pullRequest) {
          extractedCode += `// タイトル: ${diffData.pullRequest.title}\n`;
          if (diffData.pullRequest.description) {
            extractedCode += `// 説明: ${diffData.pullRequest.description.substring(
              0,
              200
            )}${diffData.pullRequest.description.length > 200 ? "..." : ""}\n`;
          }
        }

        // ファイル名だけでも表示
        if (diffData.changedFiles && Array.isArray(diffData.changedFiles)) {
          extractedCode += `\n// 変更ファイル一覧:\n`;
          diffData.changedFiles.forEach((file: any) => {
            if (file.filePath) {
              extractedCode += `// - ${file.filePath} (${
                file.status || "unknown"
              })\n`;
            }
          });
        }
      }

      return extractedCode;
    } catch (error) {
      console.error("GitHub差分からコード抽出中にエラーが発生しました:", error);
      return `// コード抽出エラー: ${
        error instanceof Error ? error.message : String(error)
      }\n// Pull Requestのコードを手動で確認してください。`;
    }
  }
}
