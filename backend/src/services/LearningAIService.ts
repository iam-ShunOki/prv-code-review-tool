// backend/src/services/LearningAIService.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { GoogleCustomSearch } from "@langchain/community/tools/google_custom_search";
import { Tool } from "langchain/tools";

// 検索クエリと説明用のスキーマ
const searchQuerySchema = z.object({
  main_concepts: z.array(z.string()).describe("主要な概念や用語（3-5個）"),
  explanation: z.string().describe("この質問に関する簡潔な説明"),
  search_queries: z.array(z.string()).describe("最適な検索クエリ（3-5個）"),
  programming_language: z
    .string()
    .nullable()
    .describe("関連するプログラミング言語（ある場合）"),
  frameworks: z
    .array(z.string())
    .nullable()
    .describe("関連するフレームワーク（ある場合）"),
  difficulty_level: z
    .enum(["beginner", "intermediate", "advanced"])
    .describe("この概念の難易度レベル"),
  recommended_resources: z
    .array(
      z.object({
        type: z.enum([
          "documentation",
          "tutorial",
          "article",
          "video",
          "course",
        ]),
        description: z.string(),
      })
    )
    .describe("推奨されるリソースの種類と説明"),
});

// レスポンス全体のスキーマ
const learningResponseSchema = z.object({
  response_intro: z.string().describe("ユーザーの質問に対する導入部分"),
  teaching_points: z
    .array(z.string())
    .describe("ユーザーに教えるべき主要なポイント"),
  code_explanation: z.string().optional().describe("コードがある場合の説明"),
  search_and_reference: searchQuerySchema.describe("検索クエリ情報と参考資料"),
  guidance_steps: z
    .array(z.string())
    .describe("学習のためのステップバイステップガイド"),
  response_conclusion: z.string().describe("結論部分"),
});

export class LearningAIService {
  //   private model: ChatAnthropic;
  private model: ChatOpenAI;
  private outputParser: StringOutputParser;
  private structuredParser: StructuredOutputParser<
    typeof learningResponseSchema
  >;
  private searchTool: Tool | null = null;

  constructor() {
    // 使用するLLMモデルを初期化
    // this.model = new ChatAnthropic({
    this.model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.2,
      maxTokens: 5000,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    this.outputParser = new StringOutputParser();

    // 構造化出力パーサーを初期化
    this.structuredParser = StructuredOutputParser.fromZodSchema(
      learningResponseSchema
    );

    // 検索ツールの初期化
    this.initializeSearchTools();
  }

  /**
   * 検索ツールの初期化
   */
  private initializeSearchTools(): void {
    if (process.env.GOOGLE_CSE_ID && process.env.GOOGLE_API_KEY) {
      this.searchTool = new GoogleCustomSearch({
        apiKey: process.env.GOOGLE_API_KEY,
        googleCSEId: process.env.GOOGLE_CSE_ID,
      });
      console.log("Google Custom Search API initialized for learning service");
    } else {
      console.log(
        "No search API keys found. Learning service will use default references."
      );
    }
  }

  /**
   * 学習者の質問に応答する（リファレンスを含む）
   */
  async getEducationalResponse(
    userMessage: string,
    chatMode: string = "general"
  ): Promise<string> {
    try {
      console.log(
        `Processing educational query in ${chatMode} mode: "${userMessage.substring(
          0,
          50
        )}..."`
      );

      // 質問からキーワードと検索クエリを抽出
      const searchData = await this.extractSearchQueries(userMessage, chatMode);
      console.log("Extracted search data:", searchData);

      // 検索クエリを使用してリファレンスを検索
      const references = await this.findReferences(
        searchData.search_queries,
        searchData.programming_language || "",
        searchData.frameworks || []
      );
      console.log("Found references:", references);

      // 教育的な応答を生成
      const response = await this.generateEducationalResponse(
        userMessage,
        chatMode,
        searchData,
        references
      );

      return response;
    } catch (error) {
      console.error("Error in educational response generation:", error);
      return `申し訳ありません。応答の生成中にエラーが発生しました: ${
        error instanceof Error ? error.message : "不明なエラー"
      }。別の質問を試してみてください。`;
    }
  }

  /**
   * ユーザーの質問から検索クエリと概念を抽出する
   */
  private async extractSearchQueries(
    userMessage: string,
    chatMode: string
  ): Promise<z.infer<typeof searchQuerySchema>> {
    // プロンプトテンプレートを作成
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたはプログラミングを学ぶ新入社員向けの教育アシスタントです。
      ユーザーの質問から、重要な概念や適切な検索キーワードを抽出してください。
      
      ## ユーザーの質問
      {userMessage}
      
      ## チャットモード
      {chatMode}
      
      ## 指示
      1. ユーザーの質問を分析し、関連する主要な概念や用語を特定してください。
      2. この質問に対する教育的な観点からの簡潔な説明を提供してください。
      3. 効果的な検索クエリを作成してください（3-5個）。
      4. 関連するプログラミング言語やフレームワークがあれば特定してください。
      5. この概念の難易度レベルを判断してください。
      6. この質問に対して推奨されるリソースの種類と説明を提供してください。
      
      必ず以下の形式でJSONとして出力してください：
      
      {format_instructions}
    `);

    try {
      // LLMにクエリを送信
      const chain = promptTemplate.pipe(this.model).pipe(this.structuredParser);

      const result = await chain.invoke({
        userMessage,
        chatMode,
        format_instructions: this.structuredParser.getFormatInstructions(),
      });

      return result.search_and_reference as z.infer<typeof searchQuerySchema>;
    } catch (error) {
      console.error("Error extracting search queries:", error);
      // エラー時はデフォルト値を返す
      return {
        main_concepts: ["プログラミング", "学習"],
        explanation: "ユーザーからのプログラミング関連の質問",
        search_queries: [`${userMessage} プログラミング チュートリアル`],
        programming_language: null,
        frameworks: [],
        difficulty_level: "beginner",
        recommended_resources: [
          {
            type: "documentation",
            description: "公式ドキュメント",
          },
        ],
      };
    }
  }

  /**
   * 検索クエリを使用してリファレンスを検索
   */
  private async findReferences(
    searchQueries: string[],
    language: string,
    frameworks: string[]
  ): Promise<string[]> {
    // 検索ツールがない場合はデフォルト参照を返す
    if (!this.searchTool) {
      return this.getDefaultReferences(language, frameworks);
    }

    try {
      // 検索クエリを選択（最大3つ）
      const queriesToProcess = searchQueries.slice(0, 3);
      const references: string[] = [];

      // 各検索クエリを処理
      for (const query of queriesToProcess) {
        try {
          // 言語/フレームワーク情報を検索クエリに追加
          let enhancedQuery = query;
          if (language) {
            enhancedQuery += ` ${language}`;
          }
          if (frameworks && frameworks.length > 0) {
            enhancedQuery += ` ${frameworks.join(" ")}`;
          }

          console.log(`Executing search query: "${enhancedQuery}"`);

          // 検索を実行
          const searchResults = await this.searchTool.invoke({
            input: enhancedQuery,
          });

          // 検索結果からURLを抽出
          const url = this.extractUrlFromSearchResults(searchResults);
          if (url && !references.includes(url)) {
            references.push(url);
          }
        } catch (error) {
          console.error(`Error in search query "${query}":`, error);
          continue;
        }
      }

      // リファレンスが見つからない場合はデフォルトを返す
      if (references.length === 0) {
        return this.getDefaultReferences(language, frameworks);
      }

      return references;
    } catch (error) {
      console.error("Error finding references:", error);
      return this.getDefaultReferences(language, frameworks);
    }
  }

  /**
   * 検索結果からURLを抽出
   */
  private extractUrlFromSearchResults(searchResults: any): string | null {
    try {
      // GoogleカスタムサーチAPI結果から抽出
      if (typeof searchResults === "object" && searchResults !== null) {
        // レスポンス構造に基づいて抽出
        if (searchResults.result) {
          const result = searchResults.result;
          if (typeof result === "string") {
            try {
              const parsed = JSON.parse(result);
              if (
                parsed.items &&
                Array.isArray(parsed.items) &&
                parsed.items.length > 0
              ) {
                return parsed.items[0].link;
              }
            } catch (e) {
              if (result.startsWith("http")) {
                return result;
              }
            }
          } else if (
            typeof result === "object" &&
            result.items &&
            Array.isArray(result.items)
          ) {
            return result.items[0]?.link || null;
          }
        }

        // 直接のレスポンス構造
        if (
          searchResults.items &&
          Array.isArray(searchResults.items) &&
          searchResults.items.length > 0
        ) {
          return searchResults.items[0].link;
        }
      }

      // 文字列からURLを抽出
      if (typeof searchResults === "string") {
        const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
        const matches = searchResults.match(urlRegex);
        if (matches && matches.length > 0) {
          return matches[0];
        }
      }

      return null;
    } catch (error) {
      console.error("Error extracting URL from search results:", error);
      return null;
    }
  }

  /**
   * 言語/フレームワークに基づくデフォルトのリファレンスを取得
   */
  private getDefaultReferences(
    language: string,
    frameworks: string[]
  ): string[] {
    const results: string[] = [];

    // 言語ごとのデフォルトリファレンス
    const languageRefs: { [key: string]: string } = {
      javascript: "https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide",
      typescript: "https://www.typescriptlang.org/docs/",
      python: "https://docs.python.org/ja/3/tutorial/",
      java: "https://dev.java/learn/",
      csharp: "https://learn.microsoft.com/ja-jp/dotnet/csharp/",
      go: "https://go.dev/doc/",
      ruby: "https://www.ruby-lang.org/ja/documentation/",
      php: "https://www.php.net/manual/ja/",
      swift: "https://docs.swift.org/swift-book/",
      kotlin: "https://kotlinlang.org/docs/",
      rust: "https://doc.rust-lang.org/book/",
    };

    // フレームワークごとのデフォルトリファレンス
    const frameworkRefs: { [key: string]: string } = {
      react: "https://ja.react.dev/learn",
      vue: "https://ja.vuejs.org/guide/introduction.html",
      angular: "https://angular.jp/docs",
      nextjs: "https://nextjs.org/docs",
      nuxtjs: "https://nuxt.com/docs",
      express: "https://expressjs.com/",
      django: "https://docs.djangoproject.com/",
      flask: "https://flask.palletsprojects.com/",
      spring: "https://spring.io/guides",
      rails: "https://guides.rubyonrails.org/",
      laravel: "https://laravel.com/docs/",
      dotnet: "https://learn.microsoft.com/ja-jp/dotnet/",
    };

    // 一般的なプログラミング学習リソース
    const generalRefs: string[] = [
      "https://www.freecodecamp.org/",
      "https://www.w3schools.com/",
      "https://developer.mozilla.org/ja/",
      "https://github.com/kamranahmedse/developer-roadmap",
    ];

    // 言語に基づくリファレンスを追加
    if (language && languageRefs[language.toLowerCase()]) {
      results.push(languageRefs[language.toLowerCase()]);
    }

    // フレームワークに基づくリファレンスを追加
    if (frameworks && frameworks.length > 0) {
      for (const framework of frameworks) {
        const lowercaseFramework = framework.toLowerCase();
        if (frameworkRefs[lowercaseFramework]) {
          results.push(frameworkRefs[lowercaseFramework]);
        }
      }
    }

    // 一般的なリソースを追加（結果が3未満の場合）
    if (results.length < 3) {
      const neededCount = 3 - results.length;
      results.push(...generalRefs.slice(0, neededCount));
    }

    return results;
  }

  /**
   * 教育的な応答を生成
   */
  private async generateEducationalResponse(
    userMessage: string,
    chatMode: string,
    searchData: z.infer<typeof searchQuerySchema>,
    references: string[]
  ): Promise<string> {
    // プロンプトテンプレートを作成
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたは新入社員向けのプログラミング学習を支援するAIアシスタントです。
      直接解答を与えるのではなく、学習を促進するヒントとリファレンスを提供してください。
      
      ## ユーザーの質問
      {userMessage}
      
      ## チャットモード
      {chatMode}
      
      ## 検索データ
      {searchData}
      
      ## 見つかったリファレンス
      {references}
      
      ## 指示
      1. ユーザーの質問に直接答えずに、考え方やアプローチを教えてください
      2. コードの答えを直接提供するのではなく、ヒントとガイダンスを提供してください
      3. 上記の参考リンクをうまく取り入れてください（最低でも2つのリンクを含める）
      4. ユーザーが自分で学ぶための具体的なステップを提案してください
      5. 回答は日本語で、新入社員にわかりやすい言葉で説明してください
      6. 何がダメで、どうすればよいかをシンプルかつ丁寧に教えてください
      7. マークダウン形式を使用して、読みやすく構造化された回答を作成してください
      8, 適度に改行や段落を入れて回答してください。(20~30文字で1段落)

        ## デザイン(backlog基準)
        - タイトル： ## タイトル
        - サブタイトル： ### サブタイトル
        - 引用： > 引用
        - リスト： - リスト
        - リンク： [リンク](https://example.com)
        - コードブロック(上下に改行を入れてください)： \`\`\`コード\`\`\`
        - 強調： **強調**
        - 斜体： *斜体*
      
      ## 重要な注意点
      - 質問に対する回答コードは絶対に提供しないでください
      - コードに関係ない質問には絶対に回答しないでください
      - 関係ない質問と判断した場合には注意喚起をしてください

      
      回答では次の要素を含めてください：
      - 質問に対するヒント(コードの答えではない)
      - 参考リンクとその内容についての簡単な説明
      
      この質問に対する教育的で指導的な回答を提供してください。
    `);

    try {
      // LLMにクエリを送信
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);

      const response = await chain.invoke({
        userMessage,
        chatMode,
        searchData: JSON.stringify(searchData, null, 2),
        references: references.join("\n"),
      });

      return response;
    } catch (error) {
      console.error("Error generating educational response:", error);

      // エラー時はフォールバック応答を返す
      const fallbackResponse = `
# 📚 プログラミング学習のヒント

ご質問ありがとうございます！以下のリソースが参考になるかもしれません：

${references.map((url) => `- [${url}](${url})`).join("\n")}

まずはこれらのリソースを確認して、基本概念を理解することをお勧めします。具体的な問題がある場合は、もう少し詳細に教えていただければ、より的確なアドバイスができます。

学習を進める際は、実際にコードを書いて試してみることが大切です。エラーに遭遇しても、それは学習プロセスの重要な一部です。

何か質問があれば、お気軽にどうぞ！
      `;

      return fallbackResponse;
    }
  }
}
