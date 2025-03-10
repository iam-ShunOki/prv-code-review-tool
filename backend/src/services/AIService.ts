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

      以下の形式で、3〜5個の重要な問題点と改善提案を提供してください。
      問題点ごとに、問題の説明、具体的な改善提案、優先度（high/medium/low）、該当する行番号（わかる場合）を含めてください。

      回答は以下のJSON形式で返してください：
      [
        {
          "problem_point": "問題点の簡潔な説明",
          "suggestion": "具体的な改善提案",
          "priority": "優先度(high/medium/low)",
          "line_number": 行番号（わからない場合はnull）
        },
        ...
      ]
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
      // 結果をパース
      const feedbacks = JSON.parse(result);
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
