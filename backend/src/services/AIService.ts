// backend/src/services/AIService.ts
import { ChatOpenAI } from "@langchain/openai";
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

export class AIService {
  private model: ChatOpenAI;
  private outputParser: StringOutputParser;
  private feedbackService: FeedbackService;
  private submissionService: SubmissionService;

  constructor() {
    // APIキーの存在確認
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OpenAI APIキーが環境変数に設定されていません");
    }

    // モデルの初期化
    const modelName = process.env.OPENAI_MODEL || "gpt-4o";
    console.log(`OpenAIモデルを初期化します: ${modelName}`);

    try {
      this.model = new ChatOpenAI({
        modelName: modelName,
        temperature: 0.1, // 一貫性のため低い温度を設定
        openAIApiKey: process.env.OPENAI_API_KEY,
        timeout: 120000, // タイムアウトを120秒に設定
      });
    } catch (error) {
      console.error("OpenAIモデルの初期化に失敗しました:", error);
      throw new Error("AIサービスの初期化に失敗しました");
    }

    this.outputParser = new StringOutputParser();
    this.feedbackService = new FeedbackService();
    this.submissionService = new SubmissionService();
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
   * プルリクエストをレビュー
   */
  async reviewPullRequest(
    projectKey: string,
    repositoryName: string,
    pullRequestId: number
  ): Promise<
    Array<{
      problem_point: string;
      suggestion: string;
      priority: FeedbackPriority;
      code_snippet?: string;
      reference_url?: string;
      category?: FeedbackCategory;
    }>
  > {
    console.log(
      `PR #${pullRequestId} (${projectKey}/${repositoryName}) のレビューを開始します`
    );

    // ここにプルリクエストレビューの実装を追加
    // 実装は別の機会に行う

    // PRコードの仮のサンプル
    const dummyCode = `
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}
`;

    // 評価実行
    const evaluationResult = await this.evaluateCodeAgainstCriteria(dummyCode);

    // 評価結果からフィードバック形式に変換
    return evaluationResult.map((result) => ({
      problem_point: result.problem_point,
      suggestion: result.suggestion,
      priority: result.priority,
      code_snippet: result.code_snippet,
      reference_url: result.reference_url,
      category: result.category,
    }));
  }
}
