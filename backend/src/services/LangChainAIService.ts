// backend/src/services/LangChainAIService.ts
import { ChatAnthropic } from "@langchain/anthropic";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Document } from "langchain/document";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";

export class LangChainAIService {
  private model: ChatAnthropic;
  private outputParser: StringOutputParser;

  constructor() {
    // APIキーを環境変数から取得
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set in environment variables");
    }

    // Claude 3.7 Sonnetモデルの初期化
    this.model = new ChatAnthropic({
      apiKey,
      modelName: "claude-3-7-sonnet-20250219", // 最新の Claude 3.7 Sonnet モデル
      temperature: 0.3, // レポート生成では一貫性が重要なので低い温度設定
    });

    this.outputParser = new StringOutputParser();
  }

  /**
   * 分析レポートのAIインサイトを生成
   */
  async generateAnalyticsInsights(data: any): Promise<any> {
    try {
      // 構造化出力パーサーの作成
      const outputParser = StructuredOutputParser.fromZodSchema(
        z.object({
          summary: z
            .string()
            .describe("データの全体的な傾向と重要なポイントをまとめた要約"),
          keyFindings: z
            .array(z.string())
            .describe("データから得られた主要な発見点のリスト"),
          recommendations: z
            .array(z.string())
            .describe("データに基づく推奨アクションのリスト"),
        })
      );

      // プロンプトに含めるデータの整形
      const formattedData = this.formatDataForPrompt(data);

      // プロンプトの作成
      const promptTemplate = PromptTemplate.fromTemplate(`
あなたはデータ分析の専門家です。以下のコードレビューツールのデータを分析し、有益なインサイトを提供してください。

### データ
{data}

上記のデータについて、以下の形式で分析結果を提供してください：
1. データの全体的な傾向と重要なポイントの要約（300文字以内）
2. データから得られた3-5個の主要な発見点
3. データに基づく3-5個の推奨アクション

新入社員のプログラミングスキル向上に役立つ、具体的で実用的なインサイトを提供してください。
結果はスキルレベルの分布、成長率、そしてこれらのデータから導き出される洞察に焦点を当ててください。

${outputParser.getFormatInstructions()}
`);

      // 入力の作成
      const input = await promptTemplate.format({
        data: formattedData,
      });

      // モデルにクエリを送信
      const response = await this.model.invoke(input);
      // レスポンスをパース
      return outputParser.parse(response.content.toString());
    } catch (error) {
      console.error("AI insights generation error:", error);
      return {
        summary: "AIによる分析を生成できませんでした。",
        keyFindings: ["データ分析中にエラーが発生しました。"],
        recommendations: ["データの完全性を確認し、再度お試しください。"],
      };
    }
  }

  /**
   * プロンプトに含めるデータを整形
   */
  private formatDataForPrompt(data: any): string {
    let result = "";

    // 基本情報の追加
    result += "【基本情報】\n";
    result += `- 新入社員数: ${data.trainees?.length || 0}名\n`;

    // filterParamsのnull/undefinedチェックを追加
    if (data.filterParams) {
      if (data.filterParams.joinYear) {
        result += `- 対象入社年度: ${data.filterParams.joinYear}年\n`;
      }
      if (data.filterParams.department) {
        result += `- 対象部署: ${data.filterParams.department}\n`;
      }
    }
    result += "\n";

    // スキルレベル分布の追加（安全にアクセス）
    result += "【スキルレベル分布】\n";
    const skillDistribution = data.skillDistribution || [];
    const traineeCount = data.trainees?.length || 0;

    if (skillDistribution.length > 0) {
      skillDistribution.forEach((item: any) => {
        if (item && typeof item === "object") {
          const level = item.level || "不明";
          const count = item.count || 0;
          const percentage =
            traineeCount > 0
              ? ((count / traineeCount) * 100).toFixed(1)
              : "0.0";
          result += `- レベル${level}: ${count}名 (${percentage}%)\n`;
        }
      });
    } else {
      result += "- スキルレベルデータがありません\n";
    }
    result += "\n";

    // 成長推移の追加（安全にアクセス）
    const growthTrend = data.growthTrend || [];
    if (growthTrend.length > 0) {
      result += "【成長推移】\n";
      growthTrend.forEach((item: any) => {
        if (item && typeof item === "object") {
          const period = item.period || "不明";
          const level =
            typeof item.averageLevel === "number"
              ? item.averageLevel.toFixed(2)
              : "不明";
          const growthRate =
            typeof item.growthRate === "number" ? item.growthRate : "不明";
          result += `- ${period}: スキルレベル ${level}, 成長率 ${growthRate}%\n`;
        }
      });
      result += "\n";
    }

    // 社員評価の統計データを追加（安全にアクセス）
    const employeeEvaluations = data.employeeEvaluations || [];
    if (employeeEvaluations.length > 0) {
      // 評価スコアの分布を計算
      const levels: Record<string, number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0,
        none: 0,
      };

      // 評価指標のスコア合計を格納するオブジェクト
      // 動的に評価基準を追跡するため、空のオブジェクトから開始
      const totalScores: Record<string, number> = {};
      let evaluatedCount = 0;

      employeeEvaluations.forEach((emp: any) => {
        if (emp && emp.evaluation) {
          // レベルのカウント
          const level = emp.evaluation.overall_level;
          if (typeof level === "string" && level in levels) {
            levels[level]++;
          }

          // 各評価指標のスコアを集計
          // 動的に評価基準のキーを検出して合計を計算
          Object.entries(emp.evaluation).forEach(([key, value]) => {
            // スコアフィールドだけを処理（数値型かつ _score で終わるキー）
            if (
              typeof value === "number" &&
              key.endsWith("_score") &&
              !isNaN(value)
            ) {
              if (!(key in totalScores)) {
                totalScores[key] = 0;
              }
              totalScores[key] += value;
            }
          });

          evaluatedCount++;
        } else {
          levels.none++;
        }
      });

      // 評価スコアの平均を計算して出力
      result += "【評価スコア平均】\n";
      if (evaluatedCount > 0) {
        Object.entries(totalScores).forEach(([key, total]) => {
          // キーから表示用の名称を生成（例: code_quality_score → コード品質）
          const displayName = key
            .replace("_score", "")
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

          result += `- ${displayName}: ${(total / evaluatedCount).toFixed(
            2
          )}\n`;
        });
      } else {
        result += "- 評価データがありません\n";
      }
      result += "\n";
    }

    // 将来の傾向予測を追加（安全にアクセス）
    if (data.futureTrend) {
      result += "【将来の傾向予測】\n";
      result += data.futureTrend + "\n\n";
    }

    return result;
  }
}
