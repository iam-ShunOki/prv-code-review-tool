// backend/src/services/AIService.ts
import { AppDataSource } from "../index";
import { FeedbackService } from "./FeedbackService";
import { CodeEmbeddingService } from "./CodeEmbeddingService";
import { CodeSubmission } from "../models/CodeSubmission";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { SubmissionService } from "./SubmissionService";
import { SubmissionStatus } from "../models/CodeSubmission";

// LangChain関連のインポート
import { OpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export class AIService {
  private feedbackService: FeedbackService;
  private codeEmbeddingService: CodeEmbeddingService;
  private submissionService: SubmissionService;
  private model: OpenAI;

  constructor() {
    this.feedbackService = new FeedbackService();
    this.codeEmbeddingService = new CodeEmbeddingService();
    this.submissionService = new SubmissionService();

    // OpenAI APIを初期化
    this.model = new OpenAI({
      modelName: "gpt-4o",
      // modelName: "o3-mini",
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * コード提出に対してAIレビューを実行
   */
  async reviewCode(submission: CodeSubmission): Promise<void> {
    try {
      console.log(`Reviewing code submission ${submission.id}...`);

      // コードをベクトル化して保存（将来的な類似コード検索のため）
      await this.codeEmbeddingService.createEmbedding(submission);

      // AIによるコード分析を実行
      const feedbacks = await this.analyzeCode(submission);

      // フィードバックをデータベースに保存
      for (const feedback of feedbacks) {
        await this.feedbackService.createFeedback(feedback);
      }

      // 提出ステータスを更新
      await this.submissionService.updateSubmissionStatus(
        submission.id,
        SubmissionStatus.REVIEWED
      );

      console.log(`Review completed for submission ${submission.id}`);
    } catch (error) {
      console.error(`Error reviewing code submission ${submission.id}:`, error);
      throw error;
    }
  }

  /**
   * コードを分析してフィードバックを生成
   */
  private async analyzeCode(
    submission: CodeSubmission
  ): Promise<Partial<Feedback>[]> {
    // レビュープロンプトを作成
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたはエキスパートプログラマーとして、新入社員のコードをレビューする任務を負っています。
      以下のコードを徹底的に分析し、問題点や改善点を特定してください。

      コード:
      \`\`\`
      {code}
      \`\`\`

      {expectation}

      コードを次の観点で評価してください：
      1. コードの品質
      2. 可読性
      3. 効率性
      4. ベストプラクティスへの準拠

      結果は以下の形式で返してください：
      - コードに問題がある場合：3〜5個の問題点と改善提案を含むJSON配列
      - コードが十分に優れている場合：空の配列（[]）

      各問題点のJSONフォーマット:
      \`\`\`json
      [
        {{
          "problem_point": "問題点の簡潔な説明",
          "suggestion": "具体的な改善提案",
          "priority": "high/medium/lowのいずれか",
          "line_number": 該当する行番号または null
        }},
        ...
      ]
      \`\`\`

      注意: コードに重大な問題がない場合は、空の配列を返してください。
    `);

    // 期待値がある場合は追加情報としてプロンプトに含める
    const expectationText = submission.expectation
      ? `開発者が期待する動作や結果：\n${submission.expectation}`
      : "特に期待する動作の説明はありません。";

    // プロンプトを実行
    const parser = new StringOutputParser();
    const chain = promptTemplate.pipe(this.model).pipe(parser);

    const result = await chain.invoke({
      code: submission.code_content,
      expectation: expectationText,
    });

    try {
      // 結果の不要な文字を削除
      const cleanedResult = result
        .replace(/```(json)?\s*/, "")
        .replace(/```$/, "")
        .trim();

      // 結果をパース
      const feedbacks = JSON.parse(cleanedResult);

      // フィードバックがない（空の配列）の場合は、良好なコードのフィードバックを返す
      if (feedbacks.length === 0) {
        return [
          {
            submission_id: submission.id,
            problem_point: "優れたコード",
            suggestion:
              "コードは全体的に良好で、重大な改善点は見つかりませんでした。素晴らしい仕事です！",
            priority: FeedbackPriority.LOW,
            line_number: undefined,
          },
        ];
      }

      // フィードバックをマッピング
      return feedbacks.map((feedback: any) => ({
        submission_id: submission.id,
        problem_point: feedback.problem_point,
        suggestion: feedback.suggestion,
        priority: this.mapPriority(feedback.priority),
        line_number:
          feedback.line_number === null ? undefined : feedback.line_number,
      }));
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      console.log("Raw response:", result);

      // エラー時はデフォルトのフィードバックを返す
      return [
        {
          submission_id: submission.id,
          problem_point: "コードレビューの分析中にエラーが発生しました",
          suggestion: "システム管理者に連絡してください。",
          priority: FeedbackPriority.MEDIUM,
          line_number: undefined,
        },
      ];
    }
  }

  /**
   * 文字列の優先度をFeedbackPriority型にマッピング
   */
  private mapPriority(priorityStr: string): FeedbackPriority {
    switch (priorityStr.toLowerCase()) {
      case "high":
        return FeedbackPriority.HIGH;
      case "low":
        return FeedbackPriority.LOW;
      case "medium":
      default:
        return FeedbackPriority.MEDIUM;
    }
  }
}
