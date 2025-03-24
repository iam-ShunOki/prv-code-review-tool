// backend/src/services/AIAssistantService.ts
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ReviewService } from "./ReviewService";
import { SubmissionService } from "./SubmissionService";
import { FeedbackService } from "./FeedbackService";

export class AIAssistantService {
  private model: ChatOpenAI;
  private streamingModel: ChatOpenAI;
  private outputParser: StringOutputParser;
  private reviewService: ReviewService;
  private submissionService: SubmissionService;
  private feedbackService: FeedbackService;

  constructor() {
    // 通常の応答用モデル
    this.model = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || "gpt-4",
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // ストリーミング応答用モデル
    this.streamingModel = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || "gpt-4",
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
      streaming: true, // ストリーミングモードを有効化
    });

    this.outputParser = new StringOutputParser();
    this.reviewService = new ReviewService();
    this.submissionService = new SubmissionService();
    this.feedbackService = new FeedbackService();
  }

  /**
   * 通常の応答を取得
   */
  async getResponse(
    userMessage: string,
    reviewId: number,
    context: {
      reviewTitle?: string;
      codeContent?: string;
      feedbacks?: Array<{
        problem_point: string;
        suggestion: string;
        priority: string;
      }>;
    }
  ): Promise<string> {
    try {
      // コンテキスト情報を充実させる
      const enhancedContext = await this.enhanceContext(reviewId, context);

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
        7. 可能な場合は、関連する公式ドキュメントやチュートリアルへのリンクを提供してください。
  
        ## 厳守事項
        コード内容やフィードバックに関係ない質問がある場合には絶対に回答しないでください。
        プライバシーに関わる質問や機密情報には一切触れないでください。
        
        以上を踏まえて、質問に対する回答を日本語で提供してください。
      `);

      // フィードバック情報をフォーマット
      const formattedFeedbacks = this.formatFeedbacks(
        enhancedContext.feedbacks
      );

      // プロンプトに変数を設定
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);
      const response = await chain.invoke({
        reviewId: reviewId.toString(),
        reviewTitle: enhancedContext.reviewTitle || `レビュー #${reviewId}`,
        codeContent:
          enhancedContext.codeContent || "コード内容は提供されていません。",
        feedbacks: formattedFeedbacks,
        userMessage,
      });

      return response;
    } catch (error) {
      console.error("AI Assistant error:", error);
      return "申し訳ありません、エラーが発生しました。もう一度お試しください。";
    }
  }

  /**
   * ストリーミング応答を取得
   */
  async *getStreamingResponse(
    userMessage: string,
    reviewId: number,
    context: {
      reviewTitle?: string;
      codeContent?: string;
      feedbacks?: Array<{
        problem_point: string;
        suggestion: string;
        priority: string;
      }>;
    }
  ): AsyncGenerator<string> {
    try {
      // コンテキスト情報を充実させる
      const enhancedContext = await this.enhanceContext(reviewId, context);

      // プロンプトテンプレートを作成（通常の応答と同じ）
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
        7. 可能な場合は、関連する公式ドキュメントやチュートリアルへのリンクを提供してください。
  
        ## 厳守事項
        コード内容やフィードバックに関係ない質問がある場合には絶対に回答しないでください。
        プライバシーに関わる質問や機密情報には一切触れないでください。
        
        以上を踏まえて、質問に対する回答を日本語で提供してください。
      `);

      // フィードバック情報をフォーマット
      const formattedFeedbacks = this.formatFeedbacks(
        enhancedContext.feedbacks
      );

      // 変数をセット
      const input = {
        reviewId: reviewId.toString(),
        reviewTitle: enhancedContext.reviewTitle || `レビュー #${reviewId}`,
        codeContent:
          enhancedContext.codeContent || "コード内容は提供されていません。",
        feedbacks: formattedFeedbacks,
        userMessage,
      };

      // ストリーミングモデルとチェーンをセットアップ
      const chain = promptTemplate
        .pipe(this.streamingModel)
        .pipe(this.outputParser);

      // ストリーミングレスポンスを生成
      const stream = await chain.stream(input);

      // ストリームからチャンクを生成
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      console.error("AI Assistant streaming error:", error);
      yield "申し訳ありません、エラーが発生しました。もう一度お試しください。";
    }
  }

  /**
   * コンテキスト情報を充実させる
   */
  private async enhanceContext(
    reviewId: number,
    context: {
      reviewTitle?: string;
      codeContent?: string;
      feedbacks?: Array<{
        problem_point: string;
        suggestion: string;
        priority: string;
      }>;
    }
  ) {
    let enhancedContext = { ...context };

    try {
      // レビュー情報を取得（リクエストに含まれていない場合）
      if (!enhancedContext.reviewTitle) {
        const review = await this.reviewService.getReviewById(reviewId);
        if (review) {
          enhancedContext.reviewTitle = review.title;
        }
      }

      // 最新のコード提出を取得（コードコンテンツがない場合）
      if (!enhancedContext.codeContent) {
        const submissions =
          await this.submissionService.getSubmissionsByReviewId(reviewId);
        if (submissions && submissions.length > 0) {
          // 最新のコード提出を取得
          const latestSubmission = submissions.reduce((latest, current) =>
            current.version > latest.version ? current : latest
          );
          enhancedContext.codeContent = latestSubmission.code_content;

          // フィードバックを取得（フィードバックがない場合）
          if (!enhancedContext.feedbacks) {
            const feedbacks =
              await this.feedbackService.getFeedbacksBySubmissionId(
                latestSubmission.id
              );
            enhancedContext.feedbacks = feedbacks.map((feedback) => ({
              problem_point: feedback.problem_point,
              suggestion: feedback.suggestion,
              priority: feedback.priority,
            }));
          }
        }
      }
    } catch (error) {
      console.error("Error enhancing context:", error);
    }

    return enhancedContext;
  }

  /**
   * フィードバックをフォーマット
   */
  private formatFeedbacks(
    feedbacks?: Array<{
      problem_point: string;
      suggestion: string;
      priority: string;
    }>
  ): string {
    if (!feedbacks || feedbacks.length === 0) {
      return "フィードバックはありません。";
    }

    return feedbacks
      .map(
        (feedback, index) =>
          `${index + 1}. 問題点: ${feedback.problem_point}\n   提案: ${
            feedback.suggestion
          }\n   優先度: ${feedback.priority}`
      )
      .join("\n\n");
  }
}
