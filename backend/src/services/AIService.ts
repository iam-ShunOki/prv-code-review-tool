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

// プルリクエストレビューのコンテキスト型
interface PullRequestReviewContext {
  isReReview?: boolean;
  reviewHistory?: any[];
  comments?: any[];
  reviewToken?: string; // レビュートークンを追加
  sourceCommentId?: number;
}

export class AIService {
  // private model: ChatOpenAI;
  private model: ChatAnthropic;
  private outputParser: StringOutputParser;
  private feedbackService: FeedbackService;
  private submissionService: SubmissionService;
  private backlogService: BacklogService;
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
   * プルリクエストをレビュー（拡張版：レビュー履歴を考慮）
   */
  /**
   * プルリクエストをレビュー（拡張版：レビュー履歴を考慮）
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
      review_token?: string; // レビュートークン追加
    }>
  > {
    console.log(
      `PR #${pullRequestId} (${projectKey}/${repositoryName}) のレビューを開始します ${
        context?.isReReview ? "【再レビュー】" : "【初回レビュー】"
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
        // 複雑な差分データの場合は抽出メソッドを使用
        codeContent = this.extractCodeFromDiff(diffData);
        console.log(
          `PR差分からコードを抽出しました (${codeContent.length} 文字)`
        );
      }

      // レビュートークンの決定
      // 既存のトークンがあればそれを使用、なければ新規生成
      const reviewToken =
        context?.reviewToken || `review-token-${pullRequestId}-${Date.now()}`;

      console.log(`レビュートークン: ${reviewToken}`);

      // 過去のレビュー履歴などの収集（既存コード）
      let historyContext = "";
      let commentsContext = "";
      let repoContext = "";
      // これらの収集ロジックは変更不要

      // ===== 出力パースロジックの改善 =====
      // 構造化出力パーサーを定義
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

      // プロンプトフォーマットをより明確に
      const formatInstructions = outputParser.getFormatInstructions();

      // 強化したプロンプト - JSON構造を理解しやすくするよう明示的に説明
      const messages = [
        {
          role: "system",
          content:
            "あなたはプロフェッショナルなコードレビュアーです。次のコードをレビューし、指定された JSON 形式で結果を返してください。",
        },
        {
          role: "user",
          content: `以下のプルリクエストをレビューし、詳細かつ具体的なフィードバックを生成してください。
          
  # プルリクエスト情報
  - PR番号: #${pullRequestId}
  - プロジェクト: ${projectKey}
  - リポジトリ: ${repositoryName}
  - タイトル: ${prDetails.summary}
  - 説明: ${prDetails.description || "説明なし"}
  - ベースブランチ: ${prDetails.base}
  - 作成ブランチ: ${prDetails.branch}
  
  ${
    context?.isReReview
      ? `
  # 再レビュー指示
  このプルリクエストは以前にもレビューされています。以下の点に注意してください：
  1. 前回のレビューで指摘された問題が解決されているか確認してください
  2. 新しく追加された問題がないか確認してください
  3. 改善された部分については肯定的なフィードバックを提供してください
  4. 繰り返し指摘されている問題については、優先度を高くしてください
  `
      : ""
  }
  
  # 評価基準
  ${Object.entries(CodeEvaluationCriteria)
    .map(([category, criteria]) => {
      return (
        `\n## ${this.getCategoryDisplayName(category as FeedbackCategory)}\n` +
        criteria.map((item, index) => `${index + 1}. ${item}`).join("\n")
      );
    })
    .join("\n")}
  
  # 評価方法
  以下の情報を含むフィードバックを JSON 配列形式で生成してください：
  1. category: 該当する評価基準のカテゴリ (code_quality, security, performance, best_practice, readability, functionality, maintainability, architecture, other のいずれか)
  2. problem_point: 具体的な問題の説明
  3. suggestion: 問題の解決方法
  4. priority: 優先度 (high, medium, low のいずれか)
  5. code_snippet: 問題のある部分のコード (省略可)
  6. reference_url: 関連するベストプラクティスへのリンク (省略可)
  7. is_checked: コードがこの基準を満たしているかどうか (true/false)
  
  # 出力形式
  必ず以下の JSON 配列形式で回答してください：
  [
    {
      "category": "code_quality",
      "problem_point": "問題の説明",
      "suggestion": "改善提案",
      "priority": "high",
      "code_snippet": "問題のあるコード例",
      "reference_url": "https://example.com/reference",
      "is_checked": false
    },
    // 他の問題点も同様に列挙
  ]
  
  # 注意事項
  - 各カテゴリから最低1つ以上のフィードバックを生成してください。
  - 一般的なプログラミングのベストプラクティスに基づいて評価してください。
  - 具体的で実用的なフィードバックを心がけてください。
  - ${
    context?.isReReview
      ? "再レビューではより詳細かつ具体的なフィードバックを提供してください。"
      : "初回レビューでは基本的な問題点を優先してください。"
  }
  - is_checked は true/false の真偽値（文字列ではなく）で返してください。
    - true = コードがこの基準を満たしている（問題なし）
    - false = コードがこの基準を満たしていない（問題あり）
  - 必ず有効な JSON 形式で返してください。コメントは含めないでください。
  
  ${historyContext}
  ${commentsContext}
  ${repoContext}
  
  # 固有トークン
  このレビューの固有識別トークン: ${reviewToken}
  
  # プルリクエストのコード内容
  \`\`\`
  ${codeContent}
  \`\`\`
  
  ${formatInstructions}
  `,
        },
      ];

      // OpenAIモデルを直接呼び出す
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
          "AIからの応答の最初の200文字:",
          resultText.substring(0, 200)
        );

        // JSON部分を抽出するための正規表現
        const jsonMatch = resultText.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) {
          console.log("JSONパターンが見つかりました、抽出を試みます");
          try {
            // JSON文字列を抽出してパース
            parsedResult = JSON.parse(jsonMatch[0]);
            console.log(
              `JSONとして正常にパースされました: ${parsedResult.length}件のフィードバック`
            );
          } catch (jsonError) {
            console.error("抽出されたJSONのパースに失敗しました:", jsonError);
            throw jsonError;
          }
        } else {
          // JSONが見つからない場合は直接パーサーで処理
          console.log(
            "JSONパターンが見つかりませんでした、パーサーで処理します"
          );
          parsedResult = await outputParser.parse(resultText);
        }
      } catch (parseError) {
        console.error("出力パース中にエラーが発生しました:", parseError);
        console.log(
          "パースに失敗した出力:",
          typeof result.content === "string"
            ? result.content.substring(0, 500)
            : "非文字列応答"
        );

        // フォールバック: 最低限のフィードバックを生成
        return [
          {
            problem_point: "レビュー結果のパース中にエラーが発生しました",
            suggestion:
              "システム管理者に連絡してください。コードの詳細レビューは手動で行ってください。",
            priority: FeedbackPriority.MEDIUM,
            category: FeedbackCategory.OTHER,
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
}
