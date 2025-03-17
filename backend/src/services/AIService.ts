import { OpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Feedback, FeedbackPriority } from "../models/Feedback";
import { BacklogService } from "./BacklogService";
import * as path from "path"; // path モジュールを追加
import { FeedbackService } from "./FeedbackService";
import { SubmissionService } from "./SubmissionService";
import { CodeEmbeddingService } from "./CodeEmbeddingService";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";

// レビュー結果用のインターフェースを定義
interface ReviewFeedback {
  problem_point: string;
  suggestion: string;
  priority: FeedbackPriority;
  line_number?: number;
  file_path?: string;
}

interface ChatContext {
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
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
      // file_path は Feedback モデルにないので省略
    }));
  }

  // PR 用のレビュー実行
  async reviewPullRequest(
    projectKey: string,
    repoName: string,
    pullRequestId: number
  ): Promise<ReviewFeedback[]> {
    try {
      console.log(
        `Starting AI review for PR #${pullRequestId} in ${projectKey}/${repoName}`
      );

      // Get the backlog service
      const backlogService = new BacklogService();

      // Get diff information using our enhanced method
      const diffInfo = await backlogService.getPullRequestDiff(
        projectKey,
        repoName,
        pullRequestId
      );

      // エラーが返された場合の処理
      if (diffInfo.error) {
        console.warn(`Warning in PR #${pullRequestId}: ${diffInfo.error}`);
        return [
          {
            problem_point: "差分の取得に問題が発生しました",
            suggestion: `GitHub PR の差分情報を取得できませんでした。\n\n理由: ${diffInfo.error}\n\nPRの内容を確認し、ブランチ名が正しいことを確認してください。`,
            priority: FeedbackPriority.MEDIUM,
            line_number: undefined,
            file_path: "error.log",
          },
        ];
      }

      if (!diffInfo.changedFiles || diffInfo.changedFiles.length === 0) {
        console.log(`No changed files found for PR #${pullRequestId}`);
        return [
          {
            problem_point: "変更ファイルが見つかりません",
            suggestion:
              "このプルリクエストには変更されたファイルが検出されませんでした。変更が正しくコミットされていることを確認してください。",
            priority: FeedbackPriority.LOW,
            line_number: undefined,
            file_path: "info.log",
          },
        ];
      }

      // Process each changed file
      const allFeedbacks: ReviewFeedback[] = [];

      for (const file of diffInfo.changedFiles) {
        // Skip deleted files
        if (file.status === "deleted") {
          console.log(`Skipping deleted file: ${file.filePath}`);
          continue;
        }

        // ファイル内容が取得できているか確認
        if (!file.content) {
          console.warn(`No content available for file: ${file.filePath}`);
          allFeedbacks.push({
            problem_point: `${file.filePath} の内容を取得できませんでした`,
            suggestion:
              "ファイルの内容を取得できませんでした。ブランチが正しく設定されているか確認してください。",
            priority: FeedbackPriority.LOW,
            line_number: undefined,
            file_path: file.filePath,
          });
          continue;
        }

        // Only review code files (skip binaries, images, etc.)
        if (this.isCodeFile(file.filePath)) {
          console.log(`Reviewing file: ${file.filePath}`);
          try {
            const fileFeedbacks = await this.analyzeCodeWithContext(
              file.content,
              file.diff || "", // 差分情報がnullの場合は空文字列を使用
              {
                filePath: file.filePath,
                pullRequestId,
                projectKey,
                repoName,
              }
            );

            allFeedbacks.push(...fileFeedbacks);
          } catch (fileAnalysisError) {
            console.error(
              `Error analyzing file ${file.filePath}:`,
              fileAnalysisError
            );
            allFeedbacks.push({
              problem_point: `${file.filePath} の分析中にエラーが発生しました`,
              suggestion:
                "ファイル分析中にエラーが発生しました。システム管理者に連絡してください。",
              priority: FeedbackPriority.LOW,
              line_number: undefined,
              file_path: file.filePath,
            });
          }
        } else {
          console.log(`Skipping non-code file: ${file.filePath}`);
        }
      }

      // 何もフィードバックがない場合は良好メッセージを1つ返す
      if (allFeedbacks.length === 0) {
        return [
          {
            problem_point: "コードは良好です",
            suggestion:
              "変更内容を確認しましたが、特に問題は見つかりませんでした。良い実装です！",
            priority: FeedbackPriority.LOW,
            line_number: undefined,
            file_path: "summary.md",
          },
        ];
      }

      return allFeedbacks;
    } catch (error) {
      console.error(`Error reviewing PR #${pullRequestId}:`, error);
      // エラー時もフィードバックを返す
      return [
        {
          problem_point: "レビュー処理中にエラーが発生しました",
          suggestion: `エラー内容: ${
            error instanceof Error ? error.message : String(error)
          }\n\nシステム管理者に連絡してください。`,
          priority: FeedbackPriority.MEDIUM,
          line_number: undefined,
          file_path: "error.log",
        },
      ];
    }
  }

  // コードファイルかどうかを判定
  private isCodeFile(filePath: string): boolean {
    // Get file extension
    const ext = path.extname(filePath).toLowerCase();

    // List of extensions we consider as code
    const codeExtensions = [
      // Programming languages
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
      // Config files
      ".json",
      ".yaml",
      ".yml",
      ".xml",
      ".toml",
      ".ini",
      ".conf",
      ".config",
    ];

    return codeExtensions.includes(ext);
  }

  // 差分情報を含むコード分析
  private async analyzeCodeWithContext(
    code: string,
    diff: string | null,
    context: {
      filePath: string;
      pullRequestId: number;
      projectKey: string;
      repoName: string;
    }
  ): Promise<ReviewFeedback[]> {
    // 差分に焦点を当てたプロンプトを作成
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたはエキスパートプログラマーとして、新入社員のコード学習を支援する任務を負っています。
      以下のファイルの変更を分析し、問題点を特定してください。ただし、具体的な解決策は提供せず、
      学習を促進するヒントと公式ドキュメントへの参照を提供してください。
    
      ## ファイル情報
      ファイルパス: {filePath}
      プルリクエストID: {pullRequestId}
      プロジェクト: {projectKey}/{repoName}
    
      ## 変更差分 (Git Diff)
      \`\`\`
      {diff}
      \`\`\`
    
      ## 現在のファイル内容
      \`\`\`
      {code}
      \`\`\`
    
      ## レビュー指示
      1. 主に「変更された部分」に焦点を当ててレビューしてください
      2. コードの品質、可読性、保守性、セキュリティ、パフォーマンスの観点から「何が良くないか」のみを指摘してください
      3. 解決策は直接提供せず、問題の本質を理解できるヒントを提供してください
      4. Git Diffの行番号を参照して、問題のある箇所を具体的に示してください
      5. 各問題に関連する公式ドキュメントやベストプラクティスガイドへの具体的なURLを必ず含めてください
      6. 優先度を適切に設定してください（high: 重大な問題、medium: 改善すべき問題、low: 小さな提案）
    
      結果は以下の形式で返してください：
      - コードに問題がある場合：問題点とヒント、参考URLを含むJSON配列
      - コードが十分に優れている場合：空の配列（[]）
    
      各問題点のJSONフォーマット:
      \`\`\`json
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
      \`\`\`
    
      注意: 
      - コードに重大な問題がない場合は、空の配列を返してください
      - 必ず参考になる公式ドキュメントの具体的なURLを含めてください（トップページだけでなく、該当する詳細ページ）
      - 学習者が自ら考え、解決策を見つけられるようなヒントを心がけてください
    `);

    // Execute the prompt
    const parser = new StringOutputParser();
    const chain = promptTemplate.pipe(this.model).pipe(parser);

    const result = await chain.invoke({
      code,
      diff: diff || "差分情報は利用できません",
      filePath: context.filePath,
      pullRequestId: context.pullRequestId.toString(),
      projectKey: context.projectKey,
      repoName: context.repoName,
    });

    // レスポンスを処理
    try {
      const cleanedResult = result
        .replace(/```(json)?\s*/, "")
        .replace(/```$/, "")
        .trim();

      const feedbacks = JSON.parse(cleanedResult);

      // フィードバックがない場合のハンドリング
      if (feedbacks.length === 0) {
        return [
          {
            problem_point: "コードは良好です",
            suggestion:
              "このファイルの変更は全体的に良好で、重大な改善点は見つかりませんでした。",
            priority: FeedbackPriority.LOW,
            line_number: undefined,
            file_path: context.filePath,
          },
        ];
      }

      // フィードバックをマッピング (ReviewFeedback 型を明示的に指定)
      return feedbacks.map((feedback: any) => ({
        problem_point: feedback.problem_point,
        suggestion: feedback.suggestion,
        priority: this.mapPriority(feedback.priority),
        line_number:
          feedback.line_number === null ? undefined : feedback.line_number,
        file_path: context.filePath,
      })) as ReviewFeedback[];
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      console.log("Raw response:", result);

      // エラー時のフォールバック
      return [
        {
          problem_point: `${context.filePath} のレビュー中にエラーが発生しました`,
          suggestion: "システム管理者に連絡してください。",
          priority: FeedbackPriority.MEDIUM,
          line_number: undefined,
          file_path: context.filePath,
        },
      ];
    }
  }

  /**
   * ユーザーの質問に対する応答を生成（既存メソッド）
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
   * コード提出に対してAIレビューを実行（従来の方法 - 後方互換性のため）
   *
   * 注: このメソッドは ReviewQueueService との互換性のために維持しています
   * 新しい実装では reviewPullRequest メソッドを使用することを推奨します
   */
  async reviewCode(submission: CodeSubmission): Promise<void> {
    try {
      console.log(`Reviewing code submission ${submission.id}...`);

      // 新しい方法でコードレビューロジックを実装
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
   * コード提出を分析してフィードバックを生成（内部ヘルパーメソッド）
   */
  private async analyzeSubmissionCode(
    submission: CodeSubmission
  ): Promise<Partial<Feedback>[]> {
    // コード内容とメタデータを取得
    const code = submission.code_content;
    const expectation = submission.expectation || "";

    // エンベディング作成（将来の類似検索のため）
    try {
      const codeEmbeddingService = new CodeEmbeddingService();
      await codeEmbeddingService.createEmbedding(submission);
    } catch (embeddingError) {
      console.warn(`Warning: Failed to create embeddings: ${embeddingError}`);
      // エンベディング作成に失敗しても処理を続行
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
      - コードに問題がある場合：問題点とヒント、参考URLを含むJSON配列
      - コードが十分に優れている場合：空の配列（[]）
    
      各問題点のJSONフォーマット:
      \`\`\`json
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
      \`\`\`
    
      注意: 
      - 必ず参考になる公式ドキュメントの具体的なURLを含めてください（トップページだけでなく、該当する詳細ページ）
      - 学習者が自ら考え、解決策を見つけられるようなヒントを心がけてください
      - 解決策を直接示すのではなく、考え方や方向性を示唆するアプローチを取ってください
    `);

    // 期待値がある場合は追加情報としてプロンプトに含める
    const expectationText = expectation
      ? `開発者が期待する動作や結果：\n${expectation}`
      : "特に期待する動作の説明はありません。";

    // プロンプトを実行
    const parser = new StringOutputParser();
    const chain = promptTemplate.pipe(this.model).pipe(parser);

    const result = await chain.invoke({
      code: code,
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
}
