// backend/src/services/EvaluationCriteriaService.ts
import { AppDataSource } from "../index";
import * as fs from "fs";
import * as path from "path";
import { EvaluationCriteria } from "../models/EvaluationCriteria";

/**
 * 評価基準を管理するサービス
 * このサービスにより、評価基準の追加・変更・削除が容易になります
 */
export class EvaluationCriteriaService {
  private criteriaRepository = AppDataSource.getRepository(EvaluationCriteria);
  private static instance: EvaluationCriteriaService;

  // システムデフォルトの評価基準
  private DEFAULT_CRITERIA = [
    {
      key: "code_quality",
      name: "コード品質",
      description: "コードの品質、堅牢性、エラー処理など",
      min_score: 0,
      max_score: 10,
      weight: 1.0,
      is_active: true,
      display_order: 1,
    },
    {
      key: "readability",
      name: "可読性",
      description: "コードの読みやすさ、命名規則、コメントなど",
      min_score: 0,
      max_score: 10,
      weight: 1.0,
      is_active: true,
      display_order: 2,
    },
    {
      key: "efficiency",
      name: "効率性",
      description: "アルゴリズムの選択、メモリと時間の効率など",
      min_score: 0,
      max_score: 10,
      weight: 1.0,
      is_active: true,
      display_order: 3,
    },
    {
      key: "best_practices",
      name: "ベストプラクティス",
      description: "業界標準のプラクティスの採用と適用",
      min_score: 0,
      max_score: 10,
      weight: 1.0,
      is_active: true,
      display_order: 4,
    },
  ];

  // シングルトンパターンを使用して、アプリケーション全体で同じインスタンスを使用
  public static getInstance(): EvaluationCriteriaService {
    if (!EvaluationCriteriaService.instance) {
      EvaluationCriteriaService.instance = new EvaluationCriteriaService();
    }
    return EvaluationCriteriaService.instance;
  }

  /**
   * 初期化メソッド - アプリケーション起動時に呼び出す
   */
  async initialize(): Promise<void> {
    try {
      // DBに評価基準が存在するか確認
      const existingCriteria = await this.criteriaRepository.find();

      // 基準が存在しない場合はデフォルト値を追加
      if (existingCriteria.length === 0) {
        console.log("デフォルトの評価基準を初期化します");
        await this.initializeDefaultCriteria();
      }

      // 設定ファイルから追加の評価基準があれば読み込む
      await this.loadCustomCriteriaFromConfig();

      console.log("評価基準の初期化が完了しました");
    } catch (error) {
      console.error("評価基準の初期化中にエラーが発生しました:", error);
    }
  }

  /**
   * デフォルトの評価基準をDBに初期化
   */
  private async initializeDefaultCriteria(): Promise<void> {
    try {
      const criteria = this.DEFAULT_CRITERIA.map((c) => {
        const criteriaEntity = new EvaluationCriteria();
        Object.assign(criteriaEntity, c);
        return criteriaEntity;
      });

      await this.criteriaRepository.save(criteria);
    } catch (error) {
      console.error("デフォルト評価基準の初期化エラー:", error);
      throw error;
    }
  }

  /**
   * 設定ファイルから追加の評価基準を読み込む
   */
  private async loadCustomCriteriaFromConfig(): Promise<void> {
    try {
      const configPath = path.join(
        __dirname,
        "../config/evaluation-criteria.json"
      );

      // 設定ファイルが存在するか確認
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, "utf8"));

        if (Array.isArray(configData.criteria)) {
          for (const criteriaData of configData.criteria) {
            // 既存の基準が存在するか確認
            const existingCriteria = await this.criteriaRepository.findOne({
              where: { key: criteriaData.key },
            });

            if (existingCriteria) {
              // 既存の基準を更新
              Object.assign(existingCriteria, criteriaData);
              await this.criteriaRepository.save(existingCriteria);
            } else {
              // 新しい基準を追加
              const newCriteria = new EvaluationCriteria();
              Object.assign(newCriteria, criteriaData);
              await this.criteriaRepository.save(newCriteria);
            }
          }
        }
      }
    } catch (error) {
      console.error("カスタム評価基準の読み込みエラー:", error);
    }
  }

  /**
   * 全ての有効な評価基準を取得
   */
  async getAllActiveCriteria(): Promise<EvaluationCriteria[]> {
    return this.criteriaRepository.find({
      where: { is_active: true },
      order: { display_order: "ASC" },
    });
  }

  /**
   * 特定のキーで評価基準を取得
   */
  async getCriteriaByKey(key: string): Promise<EvaluationCriteria | null> {
    return this.criteriaRepository.findOne({
      where: { key },
    });
  }

  /**
   * 評価基準を新規追加
   */
  async createCriteria(
    criteriaData: Partial<EvaluationCriteria>
  ): Promise<EvaluationCriteria> {
    // キーの重複チェック
    const existingCriteria = await this.criteriaRepository.findOne({
      where: { key: criteriaData.key },
    });

    if (existingCriteria) {
      throw new Error(`評価基準キー "${criteriaData.key}" は既に存在します`);
    }

    const newCriteria = new EvaluationCriteria();
    Object.assign(newCriteria, criteriaData);

    return this.criteriaRepository.save(newCriteria);
  }

  /**
   * 評価基準を更新
   */
  async updateCriteria(
    key: string,
    criteriaData: Partial<EvaluationCriteria>
  ): Promise<EvaluationCriteria | null> {
    const criteria = await this.criteriaRepository.findOne({
      where: { key },
    });

    if (!criteria) {
      return null;
    }

    // keyは変更不可
    delete criteriaData.key;

    Object.assign(criteria, criteriaData);
    return this.criteriaRepository.save(criteria);
  }

  /**
   * 評価基準を無効化（削除ではなく無効化することで、過去のデータとの整合性を保つ）
   */
  async deactivateCriteria(key: string): Promise<boolean> {
    const criteria = await this.criteriaRepository.findOne({
      where: { key },
    });

    if (!criteria) {
      return false;
    }

    criteria.is_active = false;
    await this.criteriaRepository.save(criteria);
    return true;
  }

  /**
   * 評価基準マッピングを取得（レポート生成などで使用）
   * キー -> 名前のマッピングを返す
   */
  async getCriteriaMapping(): Promise<Record<string, string>> {
    const criteria = await this.getAllActiveCriteria();
    const mapping: Record<string, string> = {};

    criteria.forEach((c) => {
      // 例: code_quality_score -> コード品質
      mapping[`${c.key}_score`] = c.name;
    });

    return mapping;
  }

  /**
   * 総合スコアの計算（重み付け平均）
   */
  async calculateOverallScore(scores: Record<string, number>): Promise<number> {
    const criteria = await this.getAllActiveCriteria();
    let totalScore = 0;
    let totalWeight = 0;

    criteria.forEach((c) => {
      const scoreKey = `${c.key}_score`;
      if (scoreKey in scores) {
        totalScore += scores[scoreKey] * c.weight;
        totalWeight += c.weight;
      }
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * スコアからレベルを決定
   */
  async determineLevel(overallScore: number): Promise<string> {
    // A-Eのレベルを決定するロジック
    // こちらも設定可能にすることができる
    if (overallScore >= 9) return "A";
    if (overallScore >= 7) return "B";
    if (overallScore >= 5) return "C";
    if (overallScore >= 3) return "D";
    return "E";
  }
}
