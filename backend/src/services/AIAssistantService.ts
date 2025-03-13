// backend/src/services/AIAssistantService.ts
import { OpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";

interface ChatContext {
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
}

export class AIAssistantService {
  private model: OpenAI;
  private outputParser: StringOutputParser;

  constructor() {
    // OpenAI APIを初期化
    this.model = new OpenAI({
      modelName: "gpt-4o",
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    this.outputParser = new StringOutputParser();
  }

  /**
   * ユーザーの質問に対する応答を生成
   */
  async getResponse(
    userMessage: string,
    reviewId: number,
    context: ChatContext
  ): Promise<string> {
    try {
      // プロンプトテンプレートを作成
      const promptTemplate = PromptTemplate.fromTemplate(`
        あなたはコードレビューツールの AIアシスタントです。
        新入社員のプログラミング学習を支援するために、コードレビュー結果について質問に答える役割を担っています。
        
        ##レビュー情報
        レビューID: {reviewId}
        レビュータイトル: {reviewTitle}
        
        ##コード内容
        \`\`\`
        {codeContent}
        \`\`\`
        
        ##フィードバック
        {feedbacks}
        
        ##ユーザーからの質問
        {userMessage}
        
        ##応答指示
        1. 丁寧かつプロフェッショナルな口調で回答してください。
        2. 新入社員向けに分かりやすく説明してください。必要に応じて具体例を示してください。
        3. 質問に直接関係するフィードバックがある場合は、それを参照してください。
        4. フィードバックの内容について説明を求められたら、具体的な改善方法を提案してください。
        5. 分からないことには正直に「分かりません」と答えてください。
        6. 回答は簡潔に、かつ必要な情報を網羅するようにしてください。

        ## 厳守事項
        コード内容やフィードバックに関係ない質問がある場合には絶対に回答しないでください。
        プライバシーに関わる質問や機密情報には一切触れないでください。
        
        以上を踏まえて、質問に対する回答を日本語で提供してください。
      `);

      // フィードバック情報をフォーマット
      let formattedFeedbacks = "フィードバックはありません。";
      if (context.feedbacks && context.feedbacks.length > 0) {
        formattedFeedbacks = context.feedbacks
          .map(
            (feedback, index) =>
              `${index + 1}. 問題点: ${feedback.problem_point}\n   提案: ${
                feedback.suggestion
              }\n   優先度: ${feedback.priority}`
          )
          .join("\n\n");
      }

      // プロンプトに変数を設定
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);
      const response = await chain.invoke({
        reviewId: reviewId.toString(),
        reviewTitle: context.reviewTitle || `レビュー #${reviewId}`,
        codeContent: context.codeContent || "コード内容は提供されていません。",
        feedbacks: formattedFeedbacks,
        userMessage,
      });

      return response;
    } catch (error) {
      console.error("AI Assistant error:", error);
      return "申し訳ありません、エラーが発生しました。もう一度お試しください。";
    }
  }
}
