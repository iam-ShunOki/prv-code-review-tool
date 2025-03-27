// backend/src/services/AIAssistantService.ts
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { ReviewService } from "./ReviewService";
import { SubmissionService } from "./SubmissionService";
import { FeedbackService } from "./FeedbackService";
import { BacklogService } from "./BacklogService";
import { RepositoryVectorSearchService } from "./RepositoryVectorSearchService";

export class AIAssistantService {
  private model: ChatOpenAI;
  private streamingModel: ChatOpenAI;
  private outputParser: StringOutputParser;
  private reviewService: ReviewService;
  private submissionService: SubmissionService;
  private feedbackService: FeedbackService;
  private backlogService: BacklogService;
  private repositoryVectorService: RepositoryVectorSearchService;

  constructor() {
    // APIキーの存在確認
    if (!process.env.OPENAI_API_KEY) {
      console.warn("警告: OPENAI_API_KEY が環境変数に設定されていません");
    }

    // 適切なモデル名を確保
    const modelName = process.env.OPENAI_MODEL || "gpt-4o";
    console.log(`OpenAI モデルを使用: ${modelName}`);

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
      console.error("OpenAIモデル初期化エラー:", error);
    }

    this.outputParser = new StringOutputParser();
    this.reviewService = new ReviewService();
    this.submissionService = new SubmissionService();
    this.feedbackService = new FeedbackService();
    this.backlogService = new BacklogService();
    this.repositoryVectorService = new RepositoryVectorSearchService();
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
        `メッセージを処理中 (レビューID: ${reviewId}): "${userMessage.substring(
          0,
          50
        )}..."`
      );

      // コンテキスト情報を充実させる
      const enhancedContext = await this.enhanceContext(reviewId, context);
      console.log("コンテキスト拡張が完了しました");

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

        ##Backlogコメント履歴
        {backlogComments}

        ##関連コード
        {relatedCode}
        
        ##ユーザーからの質問
        {userMessage}
        
        ##応答指示
        1. 丁寧かつプロフェッショナルな口調で回答してください。
        2. 新入社員向けに分かりやすく説明してください。必要に応じて具体例を示してください。
        3. 質問に直接関係するフィードバックがある場合は、それを参照してください。
        4. Backlogのコメント履歴が関連する質問であれば、その内容を参照して回答してください。
        5. 関連コードセクションのコード例を参照して、具体的な回答を提供してください。
        6. フィードバックの内容について説明を求められたら、具体的な改善方法を提案してください。
        7. 分からないことには正直に「分かりません」と答えてください。
        8. 回答は簡潔に、かつ必要な情報を網羅するようにしてください。
        9. 可能な場合は、関連する公式ドキュメントやチュートリアルへのリンクを提供してください。
        10. 適度に改行や段落を入れて回答してください。

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
        backlogComments:
          enhancedContext.backlogComments || "Backlogコメントはありません。",
        relatedCode:
          enhancedContext.relatedCode || "関連コードは見つかりませんでした。",
        userMessage,
      };

      console.log("AIモデルにプロンプトを送信します");

      // プロンプトに変数を設定
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);
      const response = await chain.invoke(promptVariables);

      console.log(`応答の生成が完了しました (${response.length} 文字)`);
      return response;
    } catch (error) {
      console.error("AIアシスタントエラー:", error);

      // より詳細なエラーメッセージをログに記録
      if (error instanceof Error) {
        console.error(`エラー詳細: ${error.message}`);
        console.error(`スタックトレース: ${error.stack}`);
        return `申し訳ありません。AIアシスタントでエラーが発生しました: ${error.message}`;
      }

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
      console.log(`ストリーミングメッセージを処理中 (レビューID: ${reviewId})`);

      // コンテキスト情報を充実させる
      const enhancedContext = await this.enhanceContext(reviewId, context);
      console.log("ストリーミング用のコンテキスト拡張が完了しました");

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

      ##Backlogコメント履歴
      {backlogComments}

      ##関連コード
      {relatedCode}
      
      ##ユーザーからの質問
      {userMessage}
      
      ##応答指示
      1. 丁寧かつプロフェッショナルな口調で回答してください。
      2. 新入社員向けに分かりやすく説明してください。必要に応じて具体例を示してください。
      3. 質問に直接関係するフィードバックがある場合は、それを参照してください。
      4. Backlogのコメント履歴が関連する質問であれば、その内容を参照して回答してください。
      5. 関連コードセクションのコード例を参照して、具体的な回答を提供してください。
      6. フィードバックの内容について説明を求められても回答を提示しないでください。
      7. 分からないことには正直に「分かりません」と答えてください。
      8. 回答は簡潔に、かつ必要な情報を網羅するようにしてください。
      9. 可能な場合は、関連する公式ドキュメントやチュートリアルへのリンクを提供してください。

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
        backlogComments:
          enhancedContext.backlogComments || "Backlogコメントはありません。",
        relatedCode:
          enhancedContext.relatedCode || "関連コードは見つかりませんでした。",
        userMessage,
      };

      console.log("ストリーミング応答の生成を開始します");

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

        console.log("ストリーミング応答の生成が完了しました");
      } catch (innerError) {
        console.error("ストリーミング生成中にエラーが発生:", innerError);
        // ストリーミング中のエラーを捕捉し、適切なメッセージを返す
        yield innerError instanceof Error
          ? `ストリーミング生成中にエラーが発生しました: ${innerError.message}`
          : "ストリーミング生成中にエラーが発生しました。";
      }
    } catch (error) {
      console.error("AIアシスタントストリーミングエラー:", error);

      // エラーのスタックトレースをログに出力
      if (error instanceof Error) {
        console.error(`エラー詳細: ${error.message}`);
        console.error(`スタックトレース: ${error.stack}`);
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
      backlogComments?: string;
      relatedCode?: string;
    }
  ) {
    let enhancedContext = { ...context };
    let backlogComments = "";
    let relatedCode = "";

    try {
      // レビュー情報を取得（リクエストに含まれていない場合）
      if (!enhancedContext.reviewTitle) {
        console.log(`レビュータイトルを取得中 (レビューID: ${reviewId})`);
        const review = await this.reviewService.getReviewById(reviewId);
        if (review) {
          enhancedContext.reviewTitle = review.title;
          console.log(`レビュータイトルを取得: "${review.title}"`);

          // Backlog情報が存在する場合、コメント履歴を取得
          if (
            review.backlog_pr_id &&
            review.backlog_project &&
            review.backlog_repository
          ) {
            try {
              console.log(
                `Backlogコメント履歴を取得中 (PR #${review.backlog_pr_id})`
              );
              const comments = await this.backlogService.getPullRequestComments(
                review.backlog_project,
                review.backlog_repository,
                review.backlog_pr_id,
                { count: 10, order: "desc" }
              );

              if (comments && comments.length > 0) {
                backlogComments = this.formatBacklogComments(comments);
                console.log(
                  `Backlogコメント ${comments.length}件を取得しました`
                );
              } else {
                console.log(
                  `PR #${review.backlog_pr_id} にコメントはありません`
                );
              }
            } catch (commentError) {
              console.error("Backlogコメント取得エラー:", commentError);
            }

            // ベクトル検索で関連コードを取得
            try {
              console.log(`リポジトリベクトルストアから関連コードを取得中`);
              const collectionName =
                `backlog_${review.backlog_project}_${review.backlog_repository}`.replace(
                  /[^a-zA-Z0-9_]/g,
                  "_"
                );

              // 既存のコンテンツから検索クエリを作成
              const query = enhancedContext.codeContent
                ? enhancedContext.codeContent.substring(0, 1000) // コード内容の一部を使用
                : review.title; // コードがない場合はレビュータイトルを使用

              const similarCode =
                await this.repositoryVectorService.searchSimilarCodeBySnippet(
                  collectionName,
                  query,
                  3 // 最大3件取得
                );

              if (similarCode && similarCode.length > 0) {
                relatedCode = this.formatSimilarCode(similarCode);
                console.log(`関連コード ${similarCode.length}件を取得しました`);
              } else {
                console.log(`関連コードは見つかりませんでした`);
              }
            } catch (vectorError) {
              console.error("ベクトル検索エラー:", vectorError);
            }
          }
        } else {
          console.log(
            `レビューID ${reviewId} に該当するレビューが見つかりません`
          );
        }
      }

      // 最新のコード提出を取得（コードコンテンツがない場合）
      if (!enhancedContext.codeContent) {
        console.log(`コード提出を取得中 (レビューID: ${reviewId})`);
        const submissions =
          await this.submissionService.getSubmissionsByReviewId(reviewId);

        if (submissions && submissions.length > 0) {
          console.log(`${submissions.length}件のコード提出が見つかりました`);

          // 最新のコード提出を取得
          const latestSubmission = submissions.reduce((latest, current) =>
            current.version > latest.version ? current : latest
          );
          enhancedContext.codeContent = latestSubmission.code_content;
          console.log(
            `最新のコード提出を使用 (バージョン ${latestSubmission.version})`
          );

          // フィードバックを取得（フィードバックがない場合）
          if (!enhancedContext.feedbacks) {
            console.log(
              `フィードバックを取得中 (提出ID: ${latestSubmission.id})`
            );
            const feedbacks =
              await this.feedbackService.getFeedbacksBySubmissionId(
                latestSubmission.id
              );

            if (feedbacks && feedbacks.length > 0) {
              console.log(
                `${feedbacks.length}件のフィードバックが見つかりました`
              );
              enhancedContext.feedbacks = feedbacks.map((feedback) => ({
                problem_point: feedback.problem_point,
                suggestion: feedback.suggestion,
                priority: feedback.priority,
              }));
            } else {
              console.log(
                `提出ID ${latestSubmission.id} にフィードバックは見つかりませんでした`
              );
            }
          }
        } else {
          console.log(
            `レビューID ${reviewId} にコード提出は見つかりませんでした`
          );
        }
      }

      // 拡張コンテキストにBacklogコメント履歴と関連コードを追加
      enhancedContext.backlogComments = backlogComments;
      enhancedContext.relatedCode = relatedCode;
    } catch (error) {
      console.error("コンテキスト拡張中にエラー:", error);
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

  /**
   * Backlogコメントをフォーマット
   */
  private formatBacklogComments(comments: any[]): string {
    if (!comments || comments.length === 0) {
      return "Backlogコメントはありません。";
    }

    return comments
      .map((comment, index) => {
        const createdAt = new Date(comment.created).toLocaleString("ja-JP");
        const author = comment.createdUser?.name || "不明なユーザー";
        let content = comment.content?.trim() || "内容なし";

        // 長すぎる場合は短縮
        if (content.length > 300) {
          content = content.substring(0, 300) + "...";
        }

        return `${index + 1}. [${createdAt}] ${author}:\n${content}`;
      })
      .join("\n\n");
  }

  /**
   * 類似コードをフォーマット
   */
  private formatSimilarCode(similarCode: any[]): string {
    if (!similarCode || similarCode.length === 0) {
      return "関連コードは見つかりませんでした。";
    }

    return similarCode
      .map((code, index) => {
        let content = code.content?.trim() || "コードなし";
        const metadata = code.metadata || {};
        const source = metadata.source || "不明なファイル";

        // 長すぎる場合は短縮
        if (content.length > 500) {
          content = content.substring(0, 500) + "...";
        }

        return `サンプル ${
          index + 1
        } (ファイル: ${source}):\n\`\`\`\n${content}\n\`\`\``;
      })
      .join("\n\n");
  }
}
