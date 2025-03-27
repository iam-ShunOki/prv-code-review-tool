// backend/src/services/CriteriaGenerationService.ts
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";

/**
 * 評価基準生成サービス
 * AIを使用して評価基準の生成を支援します
 */
export class CriteriaGenerationService {
  private model: ChatOpenAI;
  private outputParser: StringOutputParser;

  constructor() {
    // OpenAI APIキーの存在確認
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OpenAI APIキーが環境変数に設定されていません");
    }

    // モデルの初期化
    const modelName = process.env.OPENAI_MODEL || "gpt-4o";
    console.log(
      `評価基準生成サービス: OpenAIモデルを初期化します: ${modelName}`
    );

    try {
      this.model = new ChatOpenAI({
        modelName: modelName,
        temperature: 0.7, // 創造性のため少し高めの温度設定
        openAIApiKey: process.env.OPENAI_API_KEY,
        timeout: 60000, // タイムアウトを60秒に設定
      });
    } catch (error) {
      console.error(
        "評価基準生成サービス: OpenAIモデルの初期化に失敗しました:",
        error
      );
      throw new Error("AIサービスの初期化に失敗しました");
    }

    this.outputParser = new StringOutputParser();
  }

  /**
   * 評価基準のリストを生成
   * @param category カテゴリ名（例: コード品質、セキュリティ）
   * @param referenceUrls 参考となるURL（任意）
   * @param count 生成する基準数（デフォルト: 5）
   * @returns 生成された評価基準のリスト
   */
  async generateCriteriaList(
    category: string,
    referenceUrls: string[] = [],
    count: number = 5
  ): Promise<
    Array<{
      key: string;
      name: string;
      description: string;
    }>
  > {
    console.log(
      `評価基準生成サービス: '${category}' カテゴリの評価基準を ${count} 件生成します`
    );

    try {
      // 構造化出力パーサーを定義
      const outputParser = StructuredOutputParser.fromZodSchema(
        z
          .array(
            z.object({
              key: z
                .string()
                .describe(
                  "評価基準のキー（英小文字とアンダースコアのみ、例: code_quality_naming）"
                ),
              name: z.string().describe("評価基準の名称（短く明確な表現）"),
              description: z
                .string()
                .describe("評価基準の詳細な説明（200文字以内）"),
            })
          )
          .length(count)
      );

      // 参考URLの文字列を構築
      let referencesText = "";
      if (referenceUrls && referenceUrls.length > 0) {
        referencesText =
          "参考URL:\n" + referenceUrls.map((url) => `- ${url}`).join("\n");
      }

      // プロンプトテンプレートを作成
      const promptTemplate = PromptTemplate.fromTemplate(`
あなたはプログラミング教育の専門家として、${category}に関する評価基準のリストを作成してください。
これらの評価基準は、プログラミング学習者のコードを評価するために使用されます。

# 要件
- ${count}個の評価基準を生成してください
- 各評価基準は、key, name, descriptionを持ちます
- keyは英小文字とアンダースコアのみを使用し、カテゴリを表すプレフィックスを含めてください（例: code_quality_naming）
- nameは短く明確な表現にしてください
- descriptionは評価基準の詳細な説明を200文字以内で記述してください
- より具体的で測定可能な基準を心がけてください
- 初級から上級まで幅広いレベルの学習者に適用できる基準を含めてください

${referencesText}

例:
[
  {
    "key": "code_quality_naming",
    "name": "命名規則の適切さ",
    "description": "変数、関数、クラスなどの名前が意味を明確に表し、一貫した命名規則に従っているか評価します。適切な命名は、コードの読みやすさと保守性を高めます。"
  }
]

${outputParser.getFormatInstructions()}
`);

      // モデルにクエリを送信
      const chain = promptTemplate.pipe(this.model).pipe(outputParser);
      const result = await chain.invoke({});

      console.log(
        `評価基準生成サービス: ${result.length} 件の評価基準を生成しました`
      );

      return result;
    } catch (error) {
      console.error("評価基準生成中にエラーが発生しました:", error);
      throw new Error(
        `評価基準の生成に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * カテゴリ別の評価基準セットを生成
   * @returns カテゴリごとの評価基準セット
   */
  async generateCompleteCriteriaSet(): Promise<
    Record<
      string,
      Array<{
        key: string;
        name: string;
        description: string;
      }>
    >
  > {
    console.log("評価基準生成サービス: 完全な評価基準セットを生成します");

    // 主要なカテゴリ
    const categories = [
      "コード品質",
      "可読性",
      "効率性",
      "セキュリティ",
      "ベストプラクティス",
    ];

    const result: Record<string, Array<any>> = {};

    // 各カテゴリの評価基準を生成
    for (const category of categories) {
      try {
        const criteriaList = await this.generateCriteriaList(category);
        result[category] = criteriaList;
      } catch (error) {
        console.error(
          `${category}の評価基準生成中にエラーが発生しました:`,
          error
        );
        result[category] = []; // エラー時は空リスト
      }
    }

    return result;
  }

  /**
   * 評価基準の説明を改善
   * @param key 評価基準のキー
   * @param name 評価基準の名称
   * @param currentDescription 現在の説明
   * @returns 改善された説明
   */
  async improveDescription(
    key: string,
    name: string,
    currentDescription: string
  ): Promise<string> {
    console.log(`評価基準生成サービス: '${name}' の説明を改善します`);

    try {
      // プロンプトテンプレートを作成
      const promptTemplate = PromptTemplate.fromTemplate(`
プログラミング教育における評価基準の説明を改善してください。

# 評価基準情報
- キー: ${key}
- 名称: ${name}
- 現在の説明: ${currentDescription}

# 改善のポイント
- より具体的で、何をどのように評価するか明確にしてください
- 説明は200文字以内に収めてください
- なぜこの基準が重要なのかの理由を含めてください
- 可能であれば、良い例・悪い例への言及を含めてください

改善された説明文のみを返してください。
`);

      // モデルにクエリを送信
      const chain = promptTemplate.pipe(this.model).pipe(this.outputParser);
      const result = await chain.invoke({});

      console.log(`評価基準生成サービス: 説明を改善しました`);

      return result;
    } catch (error) {
      console.error("説明の改善中にエラーが発生しました:", error);
      return currentDescription; // エラー時は現在の説明を返す
    }
  }
}
