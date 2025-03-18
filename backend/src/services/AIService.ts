// backend/src/services/AIService.ts
import { OpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { BacklogService } from "./BacklogService";
import { FeedbackService } from "./FeedbackService";
import { SubmissionService } from "./SubmissionService";
import { CodeEmbeddingService } from "./CodeEmbeddingService";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import * as path from "path";

// レビュー結果用のインターフェースを定義
interface ReviewFeedback {
  problem_point: string;
  suggestion: string;
  priority: FeedbackPriority;
  line_number?: number;
  file_path?: string;
  reference_url?: string; // 参考URLを追加
}

export class AIService {
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

  // フィードバックをデータベース保存用に変換
  async convertToDbFeedbacks(
    reviewFeedbacks: ReviewFeedback[],
    submissionId: number
  ): Promise<Partial<Feedback>[]> {
    return reviewFeedbacks.map((feedback) => ({
      submission_id: submissionId,
      problem_point: feedback.problem_point,
      suggestion: feedback.suggestion,
      priority: feedback.priority,
      line_number: feedback.line_number,
      reference_url: feedback.reference_url,
    }));
  }

  /**
   * プルリクエストのレビューを実行
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
      const backlogService = new BacklogService();
      const diffData = await backlogService.getPullRequestDiff(
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
              const feedbacks = await this.analyzeCodeWithPRContext(
                content,
                file.diff,
                {
                  filePath: actualFilePath,
                  pullRequestId,
                  projectKey,
                  repoName,
                }
              );

              allFeedbacks.push(...feedbacks);
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
                line_number: undefined,
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
        const fallbackFeedback = await this.generateFallbackReview(
          diffData,
          projectKey,
          repoName,
          pullRequestId
        );
        allFeedbacks.push(...fallbackFeedback);
      }

      // 何も問題が見つからない場合は良好メッセージを返す
      if (allFeedbacks.length === 0) {
        allFeedbacks.push({
          problem_point: "コードレビューで問題は見つかりませんでした",
          suggestion:
            "変更されたコードは良好で、重大な問題点は見つかりませんでした。良い実装です！",
          priority: FeedbackPriority.LOW,
          line_number: undefined,
          file_path: "summary.md",
          reference_url: undefined,
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
          line_number: undefined,
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
   * PR情報を用いたコード分析
   */
  private async analyzeCodeWithPRContext(
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
      6. 可能な場合は問題がある行番号を特定してください。
      7. 各問題点には関連する公式ドキュメントやベストプラクティスガイドへの具体的なURLを含めてください。
      
      結果は以下のJSON形式で返してください（マークダウンなどの追加フォーマットは不要）:
      [
        {{
          "problem_point": "問題点の簡潔な説明",
          "suggestion": "問題の本質を理解するためのヒントと学習のポイント",
          "reference_url": "関連する公式ドキュメントまたはベストプラクティスガイドのURL",
          "priority": "high/medium/low",
          "line_number": 該当する行番号または null
        }}
      ]
    `);

    // プロンプトを実行
    const parser = new StringOutputParser();
    const chain = promptTemplate.pipe(this.model).pipe(parser);

    const result = await chain.invoke({
      code,
      language,
      filePath: context.filePath,
      pullRequestId: context.pullRequestId.toString(),
      projectKey: context.projectKey,
      repoName: context.repoName,
    });

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

      const feedbacks = JSON.parse(cleanedResult);

      // フィードバックをマッピング
      return feedbacks.map((feedback: any) => ({
        problem_point: feedback.problem_point,
        suggestion: feedback.suggestion,
        priority: this.mapPriority(feedback.priority),
        line_number:
          feedback.line_number === null ? undefined : feedback.line_number,
        file_path: context.filePath,
        reference_url: feedback.reference_url,
      }));
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      console.log("Raw response:", result);

      // エラー時のフォールバック
      return [
        {
          problem_point: `${context.filePath} のレビュー中にエラーが発生しました`,
          suggestion:
            "AIからの応答を解析できませんでした。管理者に報告してください。",
          priority: FeedbackPriority.MEDIUM,
          line_number: undefined,
          file_path: context.filePath,
          reference_url: undefined,
        },
      ];
    }
  }

  /**
   * diffデータから直接フィードバックを生成するフォールバックメソッド
   */
  private async generateFallbackReview(
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
        diffText += JSON.stringify(diffData).substring(0, 10000);
      } else if (typeof diffData === "string") {
        diffText = diffData.substring(0, 10000);
      }

      if (!diffText || diffText.trim() === "") {
        return [
          {
            problem_point: "レビュー対象のコードが見つかりませんでした",
            suggestion:
              "プルリクエストにコード変更が含まれているか確認してください。",
            priority: FeedbackPriority.LOW,
            line_number: undefined,
            file_path: "general.info",
            reference_url: undefined,
          },
        ];
      }

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

        結果は以下のJSON形式で返してください（マークダウンなどの追加フォーマットは不要）:
        [
          {{
            "problem_point": "問題点の簡潔な説明",
            "suggestion": "問題の本質を理解するためのヒントと学習のポイント",
            "reference_url": "関連する公式ドキュメントまたはベストプラクティスガイドのURL",
            "priority": "high/medium/low",
            "line_number": null
          }}
        ]
      `);

      // プロンプト実行
      const parser = new StringOutputParser();
      const chain = promptTemplate.pipe(this.model).pipe(parser);

      const result = await chain.invoke({
        projectKey,
        repoName,
        pullRequestId: pullRequestId.toString(),
        diffText,
      });

      // 結果の解析
      try {
        // JSONの開始と終了を探して抽出
        const jsonStart = result.indexOf("[");
        const jsonEnd = result.lastIndexOf("]") + 1;

        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonContent = result.substring(jsonStart, jsonEnd);
          const feedbacks = JSON.parse(jsonContent);

          console.log(
            `\n\n ====最終的なフィードバックです。==== \n\n ${feedbacks}`
          );

          // 結果をマッピング
          return feedbacks.map((feedback: any) => ({
            problem_point: feedback.problem_point,
            suggestion: feedback.suggestion,
            priority: this.mapPriority(feedback.priority),
            line_number: undefined,
            file_path: "unspecified.file",
            reference_url: feedback.reference_url,
          }));
        }
      } catch (parseError) {
        console.error("Error parsing fallback review:", parseError);
      }

      // 最終フォールバック
      return [
        {
          problem_point: "コード変更の詳細な分析ができませんでした",
          suggestion:
            "提出されたコードに明確な変更が見つからないか、解析に失敗しました。より明確なコード変更をプルリクエストに含めてください。",
          priority: FeedbackPriority.MEDIUM,
          line_number: undefined,
          file_path: "analysis.error",
          reference_url: undefined,
        },
      ];
    } catch (error) {
      console.error("Failed to generate fallback review:", error);
      return [
        {
          problem_point: "レビュー生成中にエラーが発生しました",
          suggestion: `エラー内容: ${
            error instanceof Error ? error.message : String(error)
          }`,
          priority: FeedbackPriority.MEDIUM,
          line_number: undefined,
          file_path: "error.log",
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

  /**
   * コード提出に対してAIレビューを実行（従来の方法）
   */
  async reviewCode(submission: CodeSubmission): Promise<void> {
    try {
      console.log(`Reviewing code submission ${submission.id}...`);

      // コードレビューを実行
      const feedbacks = await this.analyzeSubmissionCode(submission);

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
   * コード提出を分析してフィードバックを生成
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
    
      結果は以下の形式で返してください：
      [
        {{
          "problem_point": "問題点の簡潔な説明",
          "suggestion": "問題の本質を理解するためのヒントと学習のポイント（具体的な解決策は含めない）",
          "reference_url": "関連する公式ドキュメントまたはベストプラクティスガイドの具体的なURL",
          "priority": "high/medium/lowのいずれか",
          "line_number": 該当する行番号または null
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
        reference_url: feedback.reference_url,
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
  
        ## 厳守事項
        コード内容やフィードバックに関係ない質問がある場合には絶対に回答しないでください。
        プライバシーに関わる質問や機密情報には一切触れないでください。
        質問に対して、正解を与えないでください。学習者が自ら考え、解決策を見つけられるようにサポートしてください。
        代わりに、ヒントと公式リファレンスのURL（トップページだけではなく、詳細なリンクも提示）を提供してください。
        
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
