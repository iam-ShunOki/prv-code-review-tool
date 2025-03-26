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
    // APIキーの存在確認
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        "WARNING: OPENAI_API_KEY is not set in environment variables"
      );
    }

    // 適切なモデル名を確保（デフォルトを変更）
    const modelName = process.env.OPENAI_MODEL || "gpt-4o";
    console.log(`Using OpenAI model: ${modelName}`);

    try {
      // 通常の応答用モデル
      this.model = new ChatOpenAI({
        modelName: modelName,
        temperature: 0.7,
        openAIApiKey: process.env.OPENAI_API_KEY,
        timeout: 60000, // タイムアウトを60秒に設定
      });

      // ストリーミング応答用モデル
      this.streamingModel = new ChatOpenAI({
        modelName: modelName,
        temperature: 0.7,
        openAIApiKey: process.env.OPENAI_API_KEY,
        streaming: true, // ストリーミングモードを有効化
        timeout: 60000, // タイムアウトを60秒に設定
      });
    } catch (error) {
      console.error("Failed to initialize OpenAI models:", error);
    }

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
      console.log(
        `Processing message for review #${reviewId}: "${userMessage.substring(
          0,
          50
        )}..."`
      );

      // コンテキスト情報を充実させる
      const enhancedContext = await this.enhanceContext(reviewId, context);
      console.log("Context enhanced successfully");

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
        8, 適度に改行や段落を入れて回答してください。

        ## デザイン(backlog基準)
        - タイトル： ## タイトル
        - サブタイトル： ### サブタイトル
        - 引用： > 引用
        - リスト： - リスト
        - リンク： [リンク](https://example.com)
        - コードブロック(上下に改行を入れてください)： \`\`\`コード\`\`\`
        - 強調： **強調**
        - 斜体： *斜体*
        
  
        ## 厳守事項
        コード内容やフィードバックに関係ない質問がある場合には絶対に回答しないでください。
        プライバシーに関わる質問や機密情報には一切触れないでください。
        
        以上を踏まえて、質問に対する回答を日本語で提供してください。
      `);

      // フィードバック情報をフォーマット
      const formattedFeedbacks = this.formatFeedbacks(
        enhancedContext.feedbacks
      );

      // プロンプト変数をセット
      const promptVariables = {
        reviewId: reviewId.toString(),
        reviewTitle: enhancedContext.reviewTitle || `レビュー #${reviewId}`,
        codeContent:
          enhancedContext.codeContent || "コード内容は提供されていません。",
        feedbacks: formattedFeedbacks,
        userMessage,
      };

      console.log("Sending prompt to AI model");

      // プロンプトに変数を設定
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);
      const response = await chain.invoke(promptVariables);

      console.log(`Response generated successfully (${response.length} chars)`);
      return response;
    } catch (error) {
      console.error("AI Assistant error:", error);

      // より詳細なエラーメッセージをログに記録
      if (error instanceof Error) {
        console.error(`Error details: ${error.message}`);
        console.error(`Stack trace: ${error.stack}`);
        return `申し訳ありません。AIアシスタントでエラーが発生しました: ${error.message}`;
      }

      return "申し訳ありません、エラーが発生しました。もう一度お試しください。";
    }
  }

  /**
   * ストリーミング応答を取得
   */
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
      console.log(`Processing streaming message for review #${reviewId}`);

      // コンテキスト情報を充実させる
      const enhancedContext = await this.enhanceContext(reviewId, context);
      console.log("Context enhanced successfully for streaming");

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
      4. フィードバックの内容について説明を求められても回答を提示しないでください。
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

      console.log("Starting streaming response generation");

      try {
        // ストリーミングモデルとチェーンをセットアップ
        const chain = promptTemplate
          .pipe(this.streamingModel)
          .pipe(this.outputParser);

        // ストリーミングレスポンスを生成
        let bufferText = "";
        const stream = await chain.stream(input);

        // チャンクの最小サイズ（バイト）
        const MIN_CHUNK_SIZE = 4;

        // ストリームからチャンクを生成
        for await (const chunk of stream) {
          if (chunk) {
            // バッファにチャンクを追加
            bufferText += chunk;

            // バッファが最小サイズを超えたらクライアントに送信
            if (bufferText.length >= MIN_CHUNK_SIZE) {
              yield bufferText;
              bufferText = ""; // バッファをクリア
            }
          }
        }

        // 残りのバッファを送信
        if (bufferText.length > 0) {
          yield bufferText;
        }

        console.log("Streaming response completed successfully");
      } catch (innerError) {
        console.error("Error during streaming generation:", innerError);
        // ストリーミング中のエラーを捕捉し、適切なメッセージを返す
        yield innerError instanceof Error
          ? `ストリーミング生成中にエラーが発生しました: ${innerError.message}`
          : "ストリーミング生成中にエラーが発生しました。";
      }
    } catch (error) {
      console.error("AI Assistant streaming error:", error);

      // エラーのスタックトレースをログに出力
      if (error instanceof Error) {
        console.error(`Error details: ${error.message}`);
        console.error(`Stack trace: ${error.stack}`);
        yield `申し訳ありません。AIアシスタントでエラーが発生しました: ${error.message}`;
      } else {
        yield "申し訳ありません、エラーが発生しました。もう一度お試しください。";
      }
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
        console.log(`Fetching review title for review #${reviewId}`);
        const review = await this.reviewService.getReviewById(reviewId);
        if (review) {
          enhancedContext.reviewTitle = review.title;
          console.log(`Retrieved review title: "${review.title}"`);
        } else {
          console.log(`No review found with ID ${reviewId}`);
        }
      }

      // 最新のコード提出を取得（コードコンテンツがない場合）
      if (!enhancedContext.codeContent) {
        console.log(`Fetching code submissions for review #${reviewId}`);
        const submissions =
          await this.submissionService.getSubmissionsByReviewId(reviewId);

        if (submissions && submissions.length > 0) {
          console.log(`Found ${submissions.length} code submissions`);

          // 最新のコード提出を取得
          const latestSubmission = submissions.reduce((latest, current) =>
            current.version > latest.version ? current : latest
          );
          enhancedContext.codeContent = latestSubmission.code_content;
          console.log(
            `Using latest code submission (version ${latestSubmission.version})`
          );

          // フィードバックを取得（フィードバックがない場合）
          if (!enhancedContext.feedbacks) {
            console.log(
              `Fetching feedbacks for submission #${latestSubmission.id}`
            );
            const feedbacks =
              await this.feedbackService.getFeedbacksBySubmissionId(
                latestSubmission.id
              );

            if (feedbacks && feedbacks.length > 0) {
              console.log(`Found ${feedbacks.length} feedbacks`);
              enhancedContext.feedbacks = feedbacks.map((feedback) => ({
                problem_point: feedback.problem_point,
                suggestion: feedback.suggestion,
                priority: feedback.priority,
              }));
            } else {
              console.log(
                `No feedbacks found for submission #${latestSubmission.id}`
              );
            }
          }
        } else {
          console.log(`No code submissions found for review #${reviewId}`);
        }
      }
    } catch (error) {
      console.error("Error enhancing context:", error);
      // エラーがあっても利用可能な情報だけで処理を続行
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
