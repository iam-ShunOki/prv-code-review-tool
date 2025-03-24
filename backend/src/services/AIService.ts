// backend/src/services/AIService.ts
// 既存のインポート部分はそのまま維持
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { FeedbackService } from "./FeedbackService";
import { SubmissionService } from "./SubmissionService";
import { CodeEmbeddingService } from "./CodeEmbeddingService";
import { BacklogService } from "./BacklogService";
import * as path from "path";

// 検索機能のインポート
import { GoogleCustomSearch } from "@langchain/community/tools/google_custom_search";
// import { BingSerpAPI } from "@langchain/community/tools/bing_search";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import { Tool } from "langchain/tools";

// レビュー結果用のインターフェースを定義（line_numberなし）
interface ReviewFeedback {
  problem_point: string;
  suggestion: string;
  priority: FeedbackPriority;
  file_path?: string;
  reference_url?: string; // 参考URL
  code_snippet?: string; // 問題のあるコードスニペット
}

// コード問題の検出結果パース用のスキーマ（line_numberを削除）
const codeProblemSchema = z.object({
  problem_title: z.string().describe("問題点の簡潔なタイトル"),
  code_snippet: z.string().describe("問題のあるコードスニペット"),
  description: z.string().describe("問題の詳細な説明と影響"),
  suggestion: z.string().describe("改善のための提案"),
  learning_point: z.string().describe("この問題から学べる一般的な知識"),
  search_queries: z
    .array(z.string())
    .describe("この問題に関する検索クエリ（3〜5個）"),
  priority: z.enum(["high", "medium", "low"]).describe("問題の優先度"),
  language_detected: z.string().describe("検出されたプログラミング言語"),
  reference_url: z.string().describe("参考URL"),
  framework_detected: z
    .string()
    .nullable()
    .describe("検出されたフレームワーク（ある場合）"),
});

// 全体のレビュー結果パース用のスキーマ
const codeReviewSchema = z.object({
  overall_rating: z
    .string()
    .describe("コード全体の評価（A〜Eの5段階評価を含む）"),
  detected_language: z.string().describe("検出されたプログラミング言語"),
  detected_framework: z
    .string()
    .nullable()
    .describe("検出されたフレームワーク（ある場合）"),
  problems: z.array(codeProblemSchema).describe("検出された問題点のリスト"),
  good_points: z.array(z.string()).describe("コードの良い点のリスト"),
  summary: z.string().describe("全体的なアドバイスと次のステップへの提案"),
});

export class AIService {
  // private model: ChatOpenAI;
  private model: ChatAnthropic;
  private outputParser: StringOutputParser;
  private structuredParser: StructuredOutputParser<typeof codeReviewSchema>;
  private searchTool: Tool | null = null;
  private backlogService: BacklogService;
  private useEnhancedReview: boolean = false;

  constructor() {
    // ChatOpenAI APIを初期化
    // this.model = new ChatOpenAI({
    //   modelName: "gpt-4o",
    //   temperature: 0.2,
    //   openAIApiKey: process.env.OPENAI_API_KEY,
    // });

    // ChatAnthropic APIを初期化
    this.model = new ChatAnthropic({
      modelName: "claude-3-7-sonnet-latest",
      temperature: 0.2,
      maxTokens: 5000,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.outputParser = new StringOutputParser();

    // 構造化出力パーサーを初期化
    this.structuredParser =
      StructuredOutputParser.fromZodSchema(codeReviewSchema);

    // BacklogServiceを初期化
    this.backlogService = new BacklogService();

    // 動的リファレンス検索機能の初期化（環境変数に基づく）
    this.initializeSearchTools();

    // 環境変数に基づいて拡張レビュー機能を有効/無効に設定
    this.useEnhancedReview = process.env.ENABLE_ENHANCED_REVIEW === "true";
    console.log(
      `Enhanced review with dynamic references is ${
        this.useEnhancedReview ? "enabled" : "disabled"
      }`
    );
  }

  /**
   * 検索ツールの初期化
   */
  private initializeSearchTools(): void {
    // GoogleカスタムサーチまたはBing検索を初期化（環境変数に基づく）
    if (process.env.GOOGLE_CSE_ID && process.env.GOOGLE_API_KEY) {
      this.searchTool = new GoogleCustomSearch({
        apiKey: process.env.GOOGLE_API_KEY,
        googleCSEId: process.env.GOOGLE_CSE_ID,
      });
      console.log(
        "Google Custom Search API initialized for dynamic references"
      );
    } else {
      console.log("No search API keys found. Using default references.");
    }
  }

  /**
   * プルリクエストのレビューを実行
   * (AutomaticReviewCreator.ts との互換性のために必要)
   */
  async reviewPullRequest(
    projectKey: string,
    repoName: string,
    pullRequestId: number
  ): Promise<ReviewFeedback[]> {
    console.log(
      `Starting AI review for PR #${pullRequestId} in ${projectKey}/${repoName}`
    );

    try {
      // Backlogから差分情報を取得
      const diffData = await this.backlogService.getPullRequestDiff(
        projectKey,
        repoName,
        pullRequestId
      );

      console.log(`Got diff data for PR #${pullRequestId}, processing...`);

      // 全フィードバックを格納する配列
      const allFeedbacks: ReviewFeedback[] = [];

      // diffDataの構造を確認
      if (diffData.changedFiles && Array.isArray(diffData.changedFiles)) {
        // 変更ファイルごとに処理
        for (const file of diffData.changedFiles) {
          console.log(
            `Processing file: ${file.filePath}, status: ${file.status}`
          );

          // ファイルが削除されている場合はスキップ
          if (file.status === "deleted") {
            console.log(`Skipping deleted file: ${file.filePath}`);
            continue;
          }

          // ファイルの拡張子をチェックしてコードファイルのみを処理
          if (!this.isCodeFile(file.filePath)) {
            console.log(`Skipping non-code file: ${file.filePath}`);
            continue;
          }

          try {
            // diff情報からコードを抽出
            const { content, filePath } = this.extractCodeFromGitDiff(
              file.diff
            );
            const actualFilePath = file.filePath || filePath || "unknown.file";

            if (!content || content.trim() === "") {
              console.log(
                `No content extracted from diff for ${actualFilePath}`
              );
              continue;
            }

            console.log(
              `Extracted ${
                content.split("\n").length
              } lines of code from ${actualFilePath}`
            );

            // AI分析を実行
            try {
              // 拡張レビュー機能が有効な場合は、それを使用
              let feedbacks: ReviewFeedback[];
              if (this.useEnhancedReview) {
                console.log(`Using enhanced review for file ${actualFilePath}`);

                // コード提出形式に変換してレビュー
                const mockSubmission = {
                  id: 0, // 一時的なID
                  code_content: content,
                  expectation: `プルリクエスト #${pullRequestId} (${projectKey}/${repoName}) - ファイル: ${actualFilePath}`,
                } as CodeSubmission;

                feedbacks = await this.reviewCodeWithDynamicReferences(
                  mockSubmission
                );
              } else {
                // 従来のコード分析を実行
                console.log(`Using standard review for file ${actualFilePath}`);
                feedbacks = await this.analyzeCodeForPR(content, file.diff, {
                  filePath: actualFilePath,
                  pullRequestId,
                  projectKey,
                  repoName,
                });
              }

              console.log(
                `Got ${feedbacks.length} feedbacks for ${actualFilePath}`
              );
              if (feedbacks && feedbacks.length > 0) {
                // ファイルパスを設定
                feedbacks.forEach((feedback) => {
                  feedback.file_path = actualFilePath;
                });
                allFeedbacks.push(...feedbacks);
              }
            } catch (analysisError) {
              console.error(
                `Error analyzing file ${actualFilePath}:`,
                analysisError
              );

              // エラー情報を確認して適切なフィードバックを生成
              const errorMessage =
                analysisError instanceof Error
                  ? analysisError.message
                  : String(analysisError);

              let suggestion = "コードの解析中にエラーが発生しました。";
              let referenceUrl = "";

              // 言語固有のエラーに対応
              if (
                actualFilePath.endsWith(".py") &&
                errorMessage.includes("f-string")
              ) {
                suggestion =
                  "Pythonのf-string構文に問題があります。f-string内の全ての変数が定義されていることを確認してください。";
                referenceUrl =
                  "https://docs.python.org/3/tutorial/inputoutput.html#formatted-string-literals";
              }

              allFeedbacks.push({
                problem_point: `${actualFilePath}のコードに構文エラーが見つかりました`,
                suggestion,
                priority: FeedbackPriority.HIGH,
                file_path: actualFilePath,
                reference_url: referenceUrl,
              });
            }
          } catch (fileProcessingError) {
            console.error(`Error processing file:`, fileProcessingError);
            continue;
          }
        }
      } else {
        console.warn(
          `changedFiles not found or not array in diffData for PR #${pullRequestId}`
        );
        console.log(
          "diffData structure:",
          JSON.stringify(diffData, null, 2).substring(0, 500) + "..."
        );

        // フォールバック処理
        const fallbackFeedback = await this.generateFallbackReviewForPR(
          diffData,
          projectKey,
          repoName,
          pullRequestId
        );

        if (fallbackFeedback && fallbackFeedback.length > 0) {
          console.log(`Got ${fallbackFeedback.length} fallback feedbacks`);
          allFeedbacks.push(...fallbackFeedback);
        }
      }

      console.log(`Total feedbacks collected: ${allFeedbacks.length}`);

      // 何も問題が見つからない場合は良好メッセージを返す
      if (allFeedbacks.length === 0) {
        console.log("No issues found, adding positive feedback");
        allFeedbacks.push({
          problem_point: "コードレビューで問題は見つかりませんでした",
          suggestion:
            "変更されたコードは良好で、重大な問題点は見つかりませんでした。良い実装です！",
          priority: FeedbackPriority.LOW,
          file_path: "summary.md",
          reference_url: "https://github.com/goldbergyoni/nodebestpractices",
        });
      }

      return allFeedbacks;
    } catch (error) {
      console.error(`Error reviewing PR #${pullRequestId}:`, error);
      return [
        {
          problem_point: "レビュー処理中にエラーが発生しました",
          suggestion: `エラー内容: ${
            error instanceof Error ? error.message : String(error)
          }`,
          priority: FeedbackPriority.MEDIUM,
          file_path: "error.log",
          reference_url: undefined,
        },
      ];
    }
  }

  /**
   * Gitのdiffテキストから実際のコード内容を抽出
   */
  private extractCodeFromGitDiff(diffText: string): {
    content: string;
    filePath: string | null;
  } {
    try {
      // ファイル名を抽出
      let filePath = null;
      const filePathMatch = diffText.match(/\+\+\+ b\/(.*?)$/m);
      if (
        filePathMatch &&
        filePathMatch[1] &&
        filePathMatch[1] !== "/dev/null"
      ) {
        filePath = filePathMatch[1];
      }

      // 追加された行のみを抽出
      const codeLines: string[] = [];
      const diffLines = diffText.split("\n");

      let inCodeSection = false;
      for (const line of diffLines) {
        // チャンク見出し (@@) 以降を処理
        if (line.startsWith("@@")) {
          inCodeSection = true;
          continue;
        }

        if (inCodeSection) {
          // 追加行 (+で始まる) のみを保持、先頭の+は削除
          if (line.startsWith("+")) {
            codeLines.push(line.substring(1));
          }
          // 変更なし行 (先頭記号なし) も保持
          else if (
            !line.startsWith("-") &&
            !line.startsWith("diff") &&
            !line.startsWith("index") &&
            !line.startsWith("---") &&
            !line.startsWith("+++")
          ) {
            codeLines.push(line);
          }
        }
      }

      // 最終的なコード内容
      return {
        content: codeLines.join("\n"),
        filePath,
      };
    } catch (error) {
      console.error("Error extracting code from git diff:", error);
      return {
        content: "",
        filePath: null,
      };
    }
  }

  /**
   * コードファイルかどうかを判定
   */
  private isCodeFile(filePath: string): boolean {
    // 拡張子が存在しない場合
    if (!filePath || !path.extname(filePath)) {
      return false;
    }

    // 拡張子を取得して小文字化
    const ext = path.extname(filePath).toLowerCase();

    // サポートするコード拡張子のリスト
    const codeExtensions = [
      // プログラミング言語
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".java",
      ".rb",
      ".php",
      ".c",
      ".cpp",
      ".cs",
      ".go",
      ".rs",
      ".swift",
      ".kt",
      ".scala",
      ".sh",
      ".bash",
      ".pl",
      ".r",
      ".sql",
      ".html",
      ".css",
      ".scss",
      ".sass",
      ".less",
      // 設定ファイル
      ".json",
      ".yaml",
      ".yml",
      ".xml",
      ".toml",
      ".ini",
      ".conf",
      ".config",
      // その他
      ".md",
      ".markdown",
      ".txt",
      ".gitignore",
      ".env.example",
    ];

    return codeExtensions.includes(ext);
  }

  /**
   * PR用のフォールバックレビュー生成
   */
  private async generateFallbackReviewForPR(
    diffData: any,
    projectKey: string,
    repoName: string,
    pullRequestId: number
  ): Promise<ReviewFeedback[]> {
    console.log("Using fallback review method for PR #" + pullRequestId);

    try {
      // diffDataを文字列に変換
      let diffText = "";

      if (typeof diffData === "object") {
        // PRの基本情報を追加
        if (diffData.pullRequest) {
          diffText += `プルリクエスト: ${
            diffData.pullRequest.summary || "不明"
          }\n`;
        }

        // コミット情報を追加
        if (Array.isArray(diffData.commits)) {
          diffText += `コミット数: ${diffData.commits.length}\n`;
          diffData.commits.slice(0, 3).forEach((commit: any, i: number) => {
            if (commit.message) {
              diffText += `コミット${i + 1}: ${commit.message}\n`;
            }
          });
        }

        // diffTextを追加（長すぎる場合は切り詰め）
        diffText += JSON.stringify(diffData).substring(0, 5000);
      } else if (typeof diffData === "string") {
        diffText = diffData.substring(0, 5000);
      }

      if (!diffText || diffText.trim() === "") {
        console.log("No diff text to analyze");
        return [
          {
            problem_point: "レビュー対象のコードが見つかりませんでした",
            suggestion:
              "プルリクエストにコード変更が含まれているか確認してください。",
            priority: FeedbackPriority.LOW,
            file_path: "general.info",
            reference_url: undefined,
          },
        ];
      }

      console.log(`Generated diff text summary (${diffText.length} chars)`);

      // AIに直接diffTextを渡してレビューを生成
      const promptTemplate = PromptTemplate.fromTemplate(`
        あなたはエキスパートプログラマーとして、下記のプルリクエスト情報からコードレビューを生成する任務があります。
        データが構造化されていないため、あなたの専門知識を活かして変更内容を分析し、問題点を見つけてください。

        ## プルリクエスト情報
        プロジェクト: {projectKey}/{repoName}
        PR ID: {pullRequestId}

        ## ソースデータ
        {diffText}

        ## レビュー指示
        1. 上記のデータから、コード変更を特定し、主要な問題点を最大5つ抽出してください
        2. 特定した問題のそれぞれについて、なぜ問題なのかと改善のヒントを提案してください
        3. 問題の優先度を評価してください（high, medium, low）
        4. コードの行番号への言及は避け、問題のあるコードを直接引用してください

        結果は以下の形式で返してください：
        [
          {{
            "problem_point": "問題点の簡潔な説明",
            "suggestion": "問題の本質を理解するためのヒントと学習のポイント",
            "reference_url": "関連する公式ドキュメントまたはベストプラクティスガイドのURL",
            "priority": "high/medium/low"
          }}
        ]

        ## コード例用の注意事項
        コードサンプルやJavaScriptのオブジェクト表記を含める場合は、中括弧を次のようにエスケープして記述してください：
        \`function example() \{\{ return value; \}\}\`
      `);

      try {
        // プロンプト実行
        const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);

        console.log("Sending fallback request to AI model...");
        const result = await chain.invoke({
          projectKey,
          repoName,
          pullRequestId: pullRequestId.toString(),
          diffText,
        });

        console.log(`Received fallback AI response (${result.length} chars)`);

        // JSONの開始と終了を探して抽出
        const jsonStart = result.indexOf("[");
        const jsonEnd = result.lastIndexOf("]") + 1;

        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonContent = result.substring(jsonStart, jsonEnd);
          console.log(`Extracted JSON content (${jsonContent.length} chars)`);

          try {
            const feedbacks = JSON.parse(jsonContent);
            console.log(`Parsed ${feedbacks.length} fallback feedbacks`);

            // 結果をマッピング
            return feedbacks.map((feedback: any) => ({
              problem_point: feedback.problem_point,
              suggestion: feedback.suggestion,
              priority: this.mapPriority(feedback.priority),
              file_path: "fallback.analysis",
              reference_url: feedback.reference_url || undefined,
            }));
          } catch (jsonError) {
            console.error(
              "Error parsing JSON from fallback response:",
              jsonError
            );
            console.log("JSON content:", jsonContent);
            throw jsonError;
          }
        } else {
          console.log("No valid JSON found in fallback response");
          throw new Error("No valid JSON found in fallback response");
        }
      } catch (parseError) {
        console.error("Error in fallback review generation:", parseError);

        // 最終フォールバック
        return [
          {
            problem_point: "コード変更の詳細な分析ができませんでした",
            suggestion:
              "提出されたコードに明確な変更が見つからないか、解析に失敗しました。より明確なコード変更をプルリクエストに含めてください。",
            priority: FeedbackPriority.MEDIUM,
            file_path: "analysis.error",
            reference_url: undefined,
          },
        ];
      }
    } catch (error) {
      console.error("Failed to generate fallback review:", error);
      return [
        {
          problem_point: "レビュー生成中にエラーが発生しました",
          suggestion: `エラー内容: ${
            error instanceof Error ? error.message : String(error)
          }`,
          priority: FeedbackPriority.MEDIUM,
          file_path: "error.log",
          reference_url: undefined,
        },
      ];
    }
  }

  /**
   * プルリクエスト用のコード分析
   */
  private async analyzeCodeForPR(
    code: string,
    diff: string | null,
    context: {
      filePath: string;
      pullRequestId: number;
      projectKey: string;
      repoName: string;
    }
  ): Promise<ReviewFeedback[]> {
    // ファイル拡張子を取得
    const fileExt = path.extname(context.filePath).toLowerCase();

    // 言語の特定
    const language = this.detectLanguageFromExtension(fileExt);

    console.log(`Analyzing ${language} code for ${context.filePath}`);

    // プロンプトテンプレート
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたはエキスパートプログラマーとして、新入社員のコード学習を支援する任務を負っています。
      以下のプルリクエストの変更を分析し、問題点を特定してください。
      
      ## ファイル情報
      ファイルパス: {filePath}
      言語: {language}
      プルリクエストID: {pullRequestId}
      プロジェクト: {projectKey}/{repoName}
      
      ## 変更されたコード
      \`\`\`{language}
      {code}
      \`\`\`
      
      ## レビュー指示
      1. コード内の問題点を優先度の高い順に3〜5個特定してください。
      2. それぞれの問題点について以下のポイントに注目してください：
         - コードの読みやすさと保守性
         - 命名規則とコーディング標準
         - パフォーマンスと効率性
         - エラー処理とエッジケース
         - セキュリティの懸念事項
         - {language}の特有のベストプラクティス
      3. 各問題について、なぜ問題なのかを教育的に説明し、改善のためのヒントを提供してください。
      4. 具体的な解決策ではなく、学習者が自ら考えて解決できるヒントを提供してください。
      5. 各問題の優先度を設定してください（high/medium/low）。
      6. 行番号への言及は避け、問題のあるコードを直接引用してください。
      7. 各問題点には関連する公式ドキュメントやベストプラクティスガイドへの具体的なURLを含めてください。
      8. 何も問題が見つからない場合は、その理由を説明して空の配列を返してください。
      
      命名規則の評価については、以下の2点を考慮してください:
      1. 言語/フレームワークの標準的な命名規則に従っているか
      2. 命名が処理内容や目的を適切に反映しているか
      
      結果は以下のJSON形式で返してください（マークダウンなどの追加フォーマットは不要）:
      [
        {{
          "problem_point": "問題点の簡潔な説明",
          "suggestion": "問題の本質を理解するためのヒントと学習のポイント",
          "reference_url": "関連する公式ドキュメントまたはベストプラクティスガイドのURL",
          "priority": "high/medium/low",
          "code_snippet": "問題のあるコードスニペット"
        }}
      ]

      ## コード例用の注意事項
      コードサンプルやJavaScriptのオブジェクト表記を含める場合は、中括弧を次のようにエスケープして記述してください：
      \`function example() \{\{ return value; \}\}\`
    `);

    try {
      // プロンプトを実行
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);

      console.log("Sending request to AI model...");
      const result = await chain.invoke({
        code,
        language,
        filePath: context.filePath,
        pullRequestId: context.pullRequestId.toString(),
        projectKey: context.projectKey,
        repoName: context.repoName,
      });

      console.log(`Received AI response (${result.length} chars)`);

      // 結果の解析
      try {
        // JSON部分を抽出
        let cleanedResult = result.trim();

        // JSON開始と終了を探す
        const jsonStartIndex = cleanedResult.indexOf("[");
        const jsonEndIndex = cleanedResult.lastIndexOf("]");

        if (
          jsonStartIndex !== -1 &&
          jsonEndIndex !== -1 &&
          jsonEndIndex > jsonStartIndex
        ) {
          // JSONオブジェクトのみを抽出
          cleanedResult = cleanedResult.substring(
            jsonStartIndex,
            jsonEndIndex + 1
          );
        } else {
          // マークダウンのコードブロックを削除
          cleanedResult = cleanedResult
            .replace(/```json\s*/g, "")
            .replace(/```\s*$/g, "")
            .trim();
        }

        console.log(
          `Attempting to parse JSON result: ${cleanedResult.substring(
            0,
            100
          )}...`
        );

        // 空の配列または []だけの場合は空の配列を返す
        if (
          cleanedResult === "[]" ||
          cleanedResult.trim() === "" ||
          jsonStartIndex === -1
        ) {
          console.log("Empty array or no valid JSON found");
          return [];
        }

        const feedbacks = JSON.parse(cleanedResult);
        console.log(
          `Successfully parsed JSON, found ${feedbacks.length} feedbacks`
        );

        // フィードバックをマッピング
        return feedbacks.map((feedback: any) => ({
          problem_point: feedback.problem_point,
          suggestion: feedback.suggestion,
          priority: this.mapPriority(feedback.priority),
          file_path: context.filePath,
          reference_url: feedback.reference_url,
          code_snippet: feedback.code_snippet, // コードスニペットを追加
        }));
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        console.log("Raw response:", result);

        // エラー時のフォールバック
        return [
          {
            problem_point: `${context.filePath} のレビュー中にエラーが発生しました`,
            suggestion:
              "AIからの応答を解析できませんでした。管理者に報告してください。",
            priority: FeedbackPriority.MEDIUM,
            file_path: context.filePath,
            reference_url: undefined,
          },
        ];
      }
    } catch (error) {
      console.error(`Error calling AI model:`, error);
      return [
        {
          problem_point: `AI処理エラー: ${context.filePath}`,
          suggestion: `AIモデルの呼び出し中にエラーが発生しました: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          priority: FeedbackPriority.HIGH,
          file_path: context.filePath,
          reference_url: undefined,
        },
      ];
    }
  }

  /**
   * ファイル拡張子から言語を検出
   */
  private detectLanguageFromExtension(fileExt: string): string {
    const languageMap: { [key: string]: string } = {
      // JavaScript
      ".js": "javascript",
      ".jsx": "javascript",
      // TypeScript
      ".ts": "typescript",
      ".tsx": "typescript",
      // Python
      ".py": "python",
      // Java
      ".java": "java",
      // Ruby
      ".rb": "ruby",
      // PHP
      ".php": "php",
      // C/C++
      ".c": "c",
      ".cpp": "cpp",
      ".h": "cpp",
      // C#
      ".cs": "csharp",
      // Go
      ".go": "go",
      // Rust
      ".rs": "rust",
      // Swift
      ".swift": "swift",
      // Kotlin
      ".kt": "kotlin",
      // HTML
      ".html": "html",
      ".htm": "html",
      // CSS
      ".css": "css",
      ".scss": "scss",
      ".sass": "sass",
      ".less": "less",
      // JSON
      ".json": "json",
      // YAML
      ".yml": "yaml",
      ".yaml": "yaml",
      // Markdown
      ".md": "markdown",
      ".markdown": "markdown",
      // Shell
      ".sh": "bash",
      ".bash": "bash",
      // SQL
      ".sql": "sql",
    };

    return languageMap[fileExt] || "plaintext";
  }

  /**
   * コード提出に対してAIレビューを実行
   */
  async reviewCode(submission: CodeSubmission): Promise<void> {
    try {
      console.log(`Reviewing code submission ${submission.id}...`);

      // 拡張レビュー機能が有効かどうかでレビュー方法を切り替え
      let feedbacks: Partial<Feedback>[];

      if (this.useEnhancedReview) {
        console.log(
          `Using enhanced review with dynamic references for submission ${submission.id}`
        );
        const reviewFeedbacks = await this.reviewCodeWithDynamicReferences(
          submission
        );
        feedbacks = await this.convertToDbFeedbacks(
          reviewFeedbacks,
          submission.id
        );
      } else {
        console.log(`Using standard review for submission ${submission.id}`);
        // 従来のコードレビュー方法
        feedbacks = await this.analyzeSubmissionCode(submission);
      }

      // フィードバックをデータベースに保存
      const feedbackService = new FeedbackService();
      for (const feedback of feedbacks) {
        await feedbackService.createFeedback(feedback);
      }

      // 提出ステータスを更新
      const submissionService = new SubmissionService();
      await submissionService.updateSubmissionStatus(
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
   * 動的リファレンス検索を使用したコードレビュー
   */
  private async reviewCodeWithDynamicReferences(
    submission: CodeSubmission
  ): Promise<ReviewFeedback[]> {
    try {
      console.log(
        `Enhanced review with dynamic references for submission ${submission.id}...`
      );

      // コードとコンテキスト情報を取得
      const code = submission.code_content;
      const expectation = submission.expectation || "";

      // ステップ1: コード分析と問題点の特定（構造化出力）
      const reviewResults = await this.analyzeCodeStructured(code, expectation);

      // 検出された問題がない場合
      if (reviewResults.problems.length === 0) {
        return [
          {
            problem_point: "優れたコード",
            suggestion:
              "コードは全体的に良好で、重大な改善点は見つかりませんでした。素晴らしい仕事です！",
            priority: FeedbackPriority.LOW,
            reference_url: undefined,
          },
        ];
      }

      console.log(
        `ステップ2手前 \n\n reviewResults: \n\n ${JSON.stringify(
          reviewResults
        )}\n\n`
      );

      // ステップ2: 各問題点に対する動的リファレンス検索
      const feedbacksWithReferences = await Promise.all(
        reviewResults.problems.map(async (problem) => {
          // 動的リファレンスの検索と取得
          const referenceUrl = await this.findDynamicReference(
            problem.search_queries,
            reviewResults.detected_language,
            reviewResults.detected_framework
          );

          // 結果をReviewFeedback形式に変換
          return {
            problem_point: problem.problem_title,
            suggestion: `${problem.description}\n\n学習ポイント: ${problem.learning_point}`,
            priority: this.mapPriority(problem.priority),
            file_path: undefined, // 必要に応じて設定
            reference_url: referenceUrl,
            code_snippet: problem.code_snippet, // 問題のあるコードスニペットを追加
          } as ReviewFeedback;
        })
      );

      return feedbacksWithReferences;
    } catch (error) {
      console.error(`Enhanced AI review error:`, error);
      // エラー時のフォールバック
      return [
        {
          problem_point: "AIレビュー中にエラーが発生しました",
          suggestion: `エラー内容: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          priority: FeedbackPriority.MEDIUM,
          reference_url: "https://chat.openai.com/",
        },
      ];
    }
  }

  /**
   * コードを分析して問題点を構造化された形式で返す
   */
  private async analyzeCodeStructured(
    code: string,
    expectation: string
  ): Promise<z.infer<typeof codeReviewSchema>> {
    // コード分析プロンプトテンプレート
    const codeAnalysisPrompt = PromptTemplate.fromTemplate(`
      あなたは経験豊富なシニアエンジニアとして、新入社員のコードをレビューする役割を担っています。
      提供されたコードを分析し、詳細で教育的なフィードバックを構造化形式で提供してください。
      
      ## コード
      \`\`\`
      {code}
      \`\`\`
      
      ## 開発者の期待
      {expectation}
      
      ## レビュー指示
      1. コードの言語とフレームワーク（ある場合）を検出してください
      2. コードの全体的な品質を評価し、A～Eの5段階で評価してください
      3. コードの主要な問題点（最大6件）を特定し、それぞれに対して：
         - 問題点の簡潔なタイトル
         - 問題となるコードスニペット（行番号は含めないでください）
         - なぜ現在のコードが最適でないかの詳細な説明
         - この問題から学べる一般的な原則や知識
         - **重要**: この問題に関連する3-5個の検索クエリを提案してください
           - 例: "JavaScript Promise エラーハンドリング ベストプラクティス"
           - 例: "React useEffect クリーンアップ関数 必要性"
      4. コードの良い点もリストアップしてください（最大5件）
      5. 全体的なアドバイスと次のステップへの提案を提供してください
      
      ## 命名規則のレビュー
      命名規則は2つの観点から評価してください：
      1. 言語/フレームワークの標準的な命名規則に従っているか
      2. 変数/関数/クラス名が処理内容や目的を適切に反映しているか
      
      ## 出力形式
      以下のJSONスキーマに従って出力を構造化してください：
      
      {format_instructions}
      
      ## 特別な指示
      1. 問題指摘の際は、コードスニペットを必ず引用し、なぜ現在の実装が最適でないのかを具体的に説明してください
      2. 各問題の「learning_point」セクションでは、新入社員に伝えたい重要な学習ポイントを強調してください
      3. コードスニペットは簡潔に保ちつつも、問題を理解するのに十分な文脈を含めてください
      4. 検索クエリは具体的かつ簡潔にし、言語/フレームワーク名を含めてください
      5. 提案される改善方法は具体的かつ教育的にし、単に「こう書け」ではなく「なぜそうすべきか」を説明してください
      6. 行番号についての情報は含めないでください。行番号ではなく、問題のあるコードを直接引用してください。
      7. レビューは必ず日本語で回答してください。
      8. レビューの回答は総数1,000字以内に制限してください
    `);

    // プロンプトを実行して構造化された結果を取得
    const chain = codeAnalysisPrompt
      .pipe(this.model)
      .pipe(this.structuredParser);

    // 期待値がある場合は追加
    const expectationText = expectation
      ? expectation
      : "特に期待する動作の説明はありません。";

    // チェーンを実行
    return await chain.invoke({
      code: code,
      expectation: expectationText,
      format_instructions: this.structuredParser.getFormatInstructions(),
    });
  }

  /**
   * 問題に関連する動的リファレンスを検索
   */
  private async findDynamicReference(
    searchQueries: string[],
    language: string,
    framework: string | null
  ): Promise<string> {
    // 検索ツールが設定されていない場合はデフォルトのリファレンスを返す
    if (!this.searchTool) {
      return this.getDefaultReference(language, framework);
    }

    try {
      // 最大2つの検索クエリを処理（パフォーマンスを考慮）
      const queriesToProcess = searchQueries.slice(0, 2);

      // 各検索クエリに対して処理を実行
      for (const query of queriesToProcess) {
        // 言語/フレームワーク情報を検索クエリに追加して精度を向上
        const enhancedQuery = `${query} ${language} ${
          framework || ""
        } documentation best practices`;

        try {
          console.log(`Executing search query: "${enhancedQuery}"`);

          // 検索を実行 - invoke()メソッドを使用
          const searchResults = await this.searchTool.invoke({
            input: enhancedQuery,
          });

          console.log(`Search results received. Type: ${typeof searchResults}`);
          console.log(
            `Search results preview: ${JSON.stringify(searchResults).substring(
              0,
              200
            )}...`
          );

          // 検索結果から最も関連性の高いURLを抽出
          const relevantUrl = this.extractRelevantUrl(
            searchResults,
            language,
            framework
          );

          if (relevantUrl) {
            console.log(`Found relevant URL: ${relevantUrl}`);
            return relevantUrl;
          } else {
            console.log(`No relevant URL found for query: "${enhancedQuery}"`);
          }
        } catch (searchError) {
          console.error(
            `Error in search query "${enhancedQuery}":`,
            searchError
          );
          // エラーが発生しても続行し、他のクエリで検索
          continue;
        }
      }

      console.log(
        `No relevant URLs found for any queries, using default reference`
      );
      // 検索結果がない場合はデフォルトのリファレンスを返す
      return this.getDefaultReference(language, framework);
    } catch (error) {
      console.error(`Dynamic reference search error:`, error);
      // エラー時はデフォルトのリファレンスを返す
      return this.getDefaultReference(language, framework);
    }
  }

  /**
   * 検索結果から関連性の高いURLを抽出
   */
  private extractRelevantUrl(
    searchResults: any,
    language: string,
    framework: string | null
  ): string | null {
    // デバッグログを追加
    console.log(`Search results type: ${typeof searchResults}`);
    if (typeof searchResults === "object") {
      console.log(
        `Search results keys: ${Object.keys(searchResults).join(", ")}`
      );
    }

    try {
      // 1. Google Custom Search API (LangChain v0.3+)
      if (typeof searchResults === "object" && searchResults !== null) {
        // a. モダンなLangChain v0.3+のGoogleカスタム検索結果形式
        if (searchResults.result) {
          // LangChain v0.3.xのGoogleカスタム検索ツール形式
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
              console.log(`Failed to parse search result string: ${e}`);
              // 文字列だが、JSONではない場合（URL自体である可能性も）
              if (result.startsWith("http")) {
                return result;
              }
            }
          } else if (
            typeof result === "object" &&
            result.items &&
            Array.isArray(result.items)
          ) {
            // すでにオブジェクトの場合
            return result.items[0]?.link || null;
          }
        }

        // b. 旧形式（直接GoogleカスタムAPIからのレスポンス構造）- 後方互換性のため
        if (
          searchResults.items &&
          Array.isArray(searchResults.items) &&
          searchResults.items.length > 0
        ) {
          return searchResults.items[0].link;
        }

        // c. Bing検索APIの形式
        if (
          searchResults.webPages &&
          searchResults.webPages.value &&
          searchResults.webPages.value.length > 0
        ) {
          return searchResults.webPages.value[0].url;
        }

        // d. 一般的な配列形式（まとめられた検索結果）
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          // 最初の要素にlinkかurlがあるか確認
          const firstResult = searchResults[0];
          if (typeof firstResult === "object" && firstResult !== null) {
            return firstResult.link || firstResult.url || null;
          }
        }
      }

      // 2. 文字列形式の検索結果
      if (typeof searchResults === "string") {
        // a. JSON文字列としてパース
        try {
          const parsedResults = JSON.parse(searchResults);

          // パースしたJSONを再度チェック
          if (
            parsedResults.items &&
            Array.isArray(parsedResults.items) &&
            parsedResults.items.length > 0
          ) {
            return parsedResults.items[0].link;
          }

          if (
            parsedResults.results &&
            Array.isArray(parsedResults.results) &&
            parsedResults.results.length > 0
          ) {
            return (
              parsedResults.results[0].link || parsedResults.results[0].url
            );
          }

          // LangChain v0.3+形式
          if (parsedResults.result && parsedResults.result.items) {
            return parsedResults.result.items[0].link;
          }
        } catch (e) {
          // JSONではない文字列の場合
          console.log(`Failed to parse search result as JSON: ${e}`);

          // URLのような文字列であればそのまま返す
          if (searchResults.startsWith("http")) {
            return searchResults;
          }
        }
      }

      // 3. 最終手段：文字列内からURLらしき部分を抽出
      if (typeof searchResults === "string") {
        const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
        const matches = searchResults.match(urlRegex);
        if (matches && matches.length > 0) {
          return matches[0];
        }
      }

      // どの形式にも該当しない場合はnullを返す
      console.warn(`Could not extract URL from search results`);
      return null;
    } catch (error) {
      console.error(`Error extracting URL from search results:`, error);
      return null;
    }
  }

  /**
   * 言語/フレームワークに基づくデフォルトのリファレンスを取得
   */
  private getDefaultReference(
    language: string,
    framework: string | null
  ): string {
    const defaultRefs: { [key: string]: string } = {
      javascript: "https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide",
      typescript: "https://www.typescriptlang.org/docs/",
      python: "https://docs.python.org/ja/3/tutorial/",
      java: "https://docs.oracle.com/javase/tutorial/",
      csharp: "https://docs.microsoft.com/ja-jp/dotnet/csharp/",
      go: "https://golang.org/doc/",
      ruby: "https://www.ruby-lang.org/ja/documentation/",
      php: "https://www.php.net/manual/ja/",
      swift: "https://docs.swift.org/swift-book/",
      kotlin: "https://kotlinlang.org/docs/",
      rust: "https://doc.rust-lang.org/book/",
    };

    // フレームワーク固有のリファレンス
    const frameworkRefs: { [key: string]: string } = {
      react: "https://reactjs.org/docs/getting-started.html",
      angular: "https://angular.io/docs",
      vue: "https://vuejs.org/guide/introduction.html",
      express: "https://expressjs.com/",
      django: "https://docs.djangoproject.com/",
      spring: "https://spring.io/guides",
      laravel: "https://laravel.com/docs/",
      dotnet: "https://docs.microsoft.com/ja-jp/dotnet/",
    };

    const languageKey = language.toLowerCase();

    // フレームワークが指定されていて、そのフレームワークのリファレンスがある場合はそれを返す
    if (framework) {
      const frameworkKey = framework.toLowerCase();
      if (frameworkRefs[frameworkKey]) {
        return frameworkRefs[frameworkKey];
      }
    }

    // 言語に対応するリファレンスがある場合はそれを返す、なければ汎用的なものを返す
    return defaultRefs[languageKey] || "https://github.com/google/styleguide";
  }

  /**
   * コード提出を分析してフィードバックを生成（従来のメソッド）
   */
  private async analyzeSubmissionCode(
    submission: CodeSubmission
  ): Promise<Partial<Feedback>[]> {
    // コード内容とメタデータを取得
    const code = submission.code_content;
    const expectation = submission.expectation || "";

    // エンベディング作成
    try {
      const codeEmbeddingService = new CodeEmbeddingService();
      await codeEmbeddingService.createEmbedding(submission);
    } catch (embeddingError) {
      console.warn(`Warning: Failed to create embeddings: ${embeddingError}`);
    }

    console.log(`Analyzing submission ${submission.id}`);

    // プロンプトテンプレートを作成
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたはエキスパートプログラマーとして、新入社員のコード学習を支援する任務を負っています。
      以下のコードを分析し、問題点を特定してください。ただし、具体的な解決策は提供せず、
      学習を促進するヒントと公式ドキュメントへの参照を提供してください。
    
      コード:
      \`\`\`
      {code}
      \`\`\`
    
      {expectation}
    
      以下の観点を中心にコードレビューを実施してください。
    
      1. コードの構造と設計
         - コードの構成、関数分割、再利用性などに関する問題点
         - 「何が良くないか」のみを指摘し、具体的な修正方法は提示しない
    
      2. 一般的なベストプラクティス
         - 命名規則、コードの可読性、保守性に関する問題点
         - コーディング標準やパターンからの逸脱
         - セキュリティ、パフォーマンス、エラーハンドリングの問題
    
      3. 教育的アプローチ
         - 各問題点について、なぜそれが問題なのかを説明
         - 学習者が自ら解決策を見つけられるヒントを提供
         - 関連する公式ドキュメントやベストプラクティスガイドへの具体的なURLを含める
    
      命名規則の評価についても、以下の2点を考慮してください:
      1. 言語の標準的な命名規則に従っているか
      2. 命名が処理内容や目的を適切に反映しているか
      
      行番号は不要です。代わりに、該当コードを直接引用してください。
      適度に改行を入れて読みやすくしてください。
      レビュー対象のコードも出力に含めてください。
    
      結果は以下の形式で返してください：
      [
        {{
          "problem_point": "問題点の簡潔な説明",
          "suggestion": "問題の本質を理解するためのヒントと学習のポイント（具体的な解決策は含めない）",
          "reference_url": "関連する公式ドキュメントまたはベストプラクティスガイドの具体的なURL",
          "priority": "high/medium/lowのいずれか",
          "code_snippet": "問題のあるコードスニペット"
        }},
        ...
      ]
    `);

    // 期待値がある場合は追加
    const expectationText = expectation
      ? `開発者が期待する動作や結果：\n${expectation}`
      : "特に期待する動作の説明はありません。";

    // プロンプトを実行
    const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);
    const result = await chain.invoke({
      code: code,
      expectation: expectationText,
    });

    try {
      // 結果からJSONを抽出
      let cleanedResult = result.trim();

      // JSONの開始と終了を探す
      const jsonStartIndex = cleanedResult.indexOf("[");
      const jsonEndIndex = cleanedResult.lastIndexOf("]");

      if (
        jsonStartIndex !== -1 &&
        jsonEndIndex !== -1 &&
        jsonEndIndex > jsonStartIndex
      ) {
        // JSONオブジェクトのみを抽出
        cleanedResult = cleanedResult.substring(
          jsonStartIndex,
          jsonEndIndex + 1
        );
      } else {
        // マークダウンのコードブロックを削除
        cleanedResult = cleanedResult
          .replace(/```json\s*/g, "")
          .replace(/```\s*$/g, "")
          .trim();
      }

      // 結果をパース
      const feedbacks = JSON.parse(cleanedResult);

      // 空配列の場合は良好なコードのフィードバックを返す
      if (feedbacks.length === 0) {
        return [
          {
            submission_id: submission.id,
            problem_point: "優れたコード",
            suggestion:
              "コードは全体的に良好で、重大な改善点は見つかりませんでした。素晴らしい仕事です！",
            priority: FeedbackPriority.LOW,
          },
        ];
      }

      // フィードバックをマッピング（line_numberを含めない）
      return feedbacks.map((feedback: any) => ({
        submission_id: submission.id,
        problem_point: feedback.problem_point,
        suggestion: feedback.suggestion,
        priority: this.mapPriority(feedback.priority),
        reference_url: feedback.reference_url,
        code_snippet: feedback.code_snippet, // コードスニペットを追加
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
        },
      ];
    }
  }

  /**
   * レビュー結果をデータベース保存用のフィードバックに変換（line_numberなし）
   */
  async convertToDbFeedbacks(
    reviewFeedbacks: ReviewFeedback[],
    submissionId: number
  ): Promise<Partial<Feedback>[]> {
    return reviewFeedbacks.map((feedback) => ({
      submission_id: submissionId,
      problem_point: feedback.problem_point,
      suggestion: feedback.suggestion,
      priority: feedback.priority,
      reference_url: feedback.reference_url,
      code_snippet: feedback.code_snippet, // コードスニペットを追加
    }));
  }

  /**
   * 文字列の優先度をFeedbackPriority型にマッピング
   */
  private mapPriority(priorityStr: string): FeedbackPriority {
    switch (priorityStr?.toLowerCase()) {
      case "high":
        return FeedbackPriority.HIGH;
      case "low":
        return FeedbackPriority.LOW;
      case "medium":
      default:
        return FeedbackPriority.MEDIUM;
    }
  }

  /**
   * ユーザーの質問に対する応答を生成
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
        質問に対して、正解を与えないでください。学習者が自ら考え、解決策を見つけられるようにサポートしてください。
        代わりに、ヒントと公式リファレンスのURL（トップページだけではなく、詳細なリンクも提示）を提供してください。
        行番号への言及は避け、代わりに該当コードを引用してください。
        
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
