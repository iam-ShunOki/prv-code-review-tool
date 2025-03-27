// backend/src/services/EvaluationCriteriaService.ts - 更新版
import { AppDataSource } from "../index";
import * as fs from "fs";
import * as path from "path";
import { EvaluationCriteria } from "../models/EvaluationCriteria";
import { YearlyCriteriaSetting } from "../models/YearlyCriteriaSetting";
import { AcademicYearSetting } from "../models/AcademicYearSetting";
import { CriteriaGenerationService } from "./CriteriaGenerationService";
import { In } from "typeorm";

/**
 * 評価基準を管理するサービス
 * このサービスにより、評価基準の追加・変更・削除が容易になります
 */
export class EvaluationCriteriaService {
  private criteriaRepository = AppDataSource.getRepository(EvaluationCriteria);
  private yearlySettingsRepository = AppDataSource.getRepository(
    YearlyCriteriaSetting
  );
  private academicYearRepository =
    AppDataSource.getRepository(AcademicYearSetting);
  private static instance: EvaluationCriteriaService;
  private criteriaGenerationService: CriteriaGenerationService;

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

  constructor() {
    this.criteriaGenerationService = new CriteriaGenerationService();
  }

  /**
   * 初期化メソッド - アプリケーション起動時に呼び出す
   */
  async initialize(): Promise<void> {
    try {
      console.log("評価基準の初期化を開始します");

      // DBに評価基準が存在するか確認
      const existingCriteria = await this.criteriaRepository.find();

      // 基準が存在しない場合はデフォルト値を追加
      if (existingCriteria.length === 0) {
        console.log("デフォルトの評価基準を初期化します");
        await this.initializeDefaultCriteria();
      }

      // 設定ファイルから追加の評価基準があれば読み込む
      await this.loadCustomCriteriaFromConfig();

      // 年度設定を確認・初期化
      await this.ensureAcademicYearSettings();

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
   * 年度設定を確認・初期化
   */
  private async ensureAcademicYearSettings(): Promise<void> {
    try {
      // 年度設定が存在するか確認
      const yearSettings = await this.academicYearRepository.find();

      // 年度設定が存在しない場合は、現在の年度を作成
      if (yearSettings.length === 0) {
        const currentYear = new Date().getFullYear();

        // 現在の年度と昨年度を作成
        const years = [
          {
            academic_year: currentYear,
            name: `${currentYear}年度`,
            is_current: true,
            is_active: true,
          },
          {
            academic_year: currentYear - 1,
            name: `${currentYear - 1}年度`,
            is_current: false,
            is_active: true,
          },
        ];

        for (const yearData of years) {
          const yearSetting = new AcademicYearSetting();
          Object.assign(yearSetting, yearData);
          await this.academicYearRepository.save(yearSetting);
        }

        console.log(`${years.length}件の年度設定を作成しました`);
      }

      // 現在の年度に対する評価基準の年度別設定を確認
      const currentYearSetting = await this.academicYearRepository.findOne({
        where: { is_current: true },
      });

      if (currentYearSetting) {
        const currentYear = currentYearSetting.academic_year;

        // 全ての有効な評価基準を取得
        const activeCriteria = await this.criteriaRepository.find({
          where: { is_active: true },
        });

        // 年度別設定が存在しない評価基準を特定
        for (const criteria of activeCriteria) {
          const yearlySettings = await this.yearlySettingsRepository.findOne({
            where: {
              criteria_id: criteria.id,
              academic_year: currentYear,
            },
          });

          if (!yearlySettings) {
            // 年度別設定を作成
            const newSetting = new YearlyCriteriaSetting();
            newSetting.criteria_id = criteria.id;
            newSetting.academic_year = currentYear;
            newSetting.weight = criteria.weight;
            newSetting.is_active = criteria.is_active;

            await this.yearlySettingsRepository.save(newSetting);
            console.log(
              `評価基準 ${criteria.key} の ${currentYear}年度設定を作成しました`
            );
          }
        }
      }
    } catch (error) {
      console.error("年度設定の確認・初期化中にエラーが発生しました:", error);
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
   * 特定の年度の有効な評価基準を取得
   */
  async getActiveCriteriaForYear(year: number): Promise<any[]> {
    // 年度別の設定を考慮した評価基準を取得
    const yearlySettings = await this.yearlySettingsRepository.find({
      where: { academic_year: year, is_active: true },
      relations: ["criteria"],
    });

    // 基準とその年度別設定を結合
    return yearlySettings
      .filter((setting) => setting.criteria && setting.criteria.is_active)
      .map((setting) => ({
        ...setting.criteria,
        yearWeight: setting.weight, // 年度別の重み
        yearActive: setting.is_active, // 年度別の有効フラグ
        yearSettingId: setting.id, // 年度別設定のID
      }));
  }

  /**
   * 現在の年度の有効な評価基準を取得
   */
  async getActiveCriteriaForCurrentYear(): Promise<any[]> {
    // 現在の年度を取得
    const currentYear = await this.academicYearRepository.findOne({
      where: { is_current: true },
    });

    if (!currentYear) {
      // 現在の年度が設定されていない場合、通常の有効な基準を返す
      return this.getAllActiveCriteria();
    }

    return this.getActiveCriteriaForYear(currentYear.academic_year);
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

    const savedCriteria = await this.criteriaRepository.save(newCriteria);

    // 全ての有効な年度に対して年度別設定を作成
    const activeYears = await this.academicYearRepository.find({
      where: { is_active: true },
    });

    for (const year of activeYears) {
      const yearlySettings = new YearlyCriteriaSetting();
      yearlySettings.criteria_id = savedCriteria.id;
      yearlySettings.academic_year = year.academic_year;
      yearlySettings.weight = criteriaData.weight || 1.0;
      yearlySettings.is_active = criteriaData.is_active !== false; // デフォルトはtrue

      await this.yearlySettingsRepository.save(yearlySettings);
    }

    return savedCriteria;
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
   * 複数の評価基準を一括更新（表示順序など）
   */
  async bulkUpdateCriteria(
    updates: Array<{
      id: number;
      display_order: number;
      weight?: number;
      is_active?: boolean;
    }>
  ): Promise<boolean> {
    try {
      // トランザクション内で一括更新
      await AppDataSource.transaction(async (transactionalEntityManager) => {
        for (const update of updates) {
          await transactionalEntityManager
            .createQueryBuilder()
            .update(EvaluationCriteria)
            .set({
              display_order: update.display_order,
              weight: update.weight,
              is_active: update.is_active,
            })
            .where("id = :id", { id: update.id })
            .execute();
        }
      });

      return true;
    } catch (error) {
      console.error("評価基準の一括更新中にエラーが発生しました:", error);
      return false;
    }
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
    const criteria = await this.getActiveCriteriaForCurrentYear();
    let totalScore = 0;
    let totalWeight = 0;

    criteria.forEach((c) => {
      const scoreKey = `${c.key}_score`;
      if (scoreKey in scores) {
        // 年度別の重みを使用
        const weight = c.yearWeight || c.weight;
        totalScore += scores[scoreKey] * weight;
        totalWeight += weight;
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

  /**
   * 年度を作成・更新
   */
  async createOrUpdateAcademicYear(
    year: number,
    name: string,
    isCurrent: boolean = false,
    description?: string
  ): Promise<AcademicYearSetting> {
    // 既存の年度を確認
    let yearSetting = await this.academicYearRepository.findOne({
      where: { academic_year: year },
    });

    if (!yearSetting) {
      // 新規作成
      yearSetting = new AcademicYearSetting();
      yearSetting.academic_year = year;
    }

    // 更新
    yearSetting.name = name;
    yearSetting.description = description || "";
    yearSetting.is_active = true;

    // 現在の年度として設定する場合、他の年度をすべて非現在に設定
    if (isCurrent) {
      await this.academicYearRepository.update(
        { is_current: true },
        { is_current: false }
      );
      yearSetting.is_current = true;
    }

    // 保存
    const savedYear = await this.academicYearRepository.save(yearSetting);

    // この年度に対する評価基準の年度別設定を確認・作成
    const allCriteria = await this.criteriaRepository.find();

    for (const criteria of allCriteria) {
      // 既存の年度別設定を確認
      const existingSettings = await this.yearlySettingsRepository.findOne({
        where: {
          criteria_id: criteria.id,
          academic_year: year,
        },
      });

      if (!existingSettings) {
        // 年度別設定を作成
        const yearlySettings = new YearlyCriteriaSetting();
        yearlySettings.criteria_id = criteria.id;
        yearlySettings.academic_year = year;
        yearlySettings.weight = criteria.weight;
        yearlySettings.is_active = criteria.is_active;

        await this.yearlySettingsRepository.save(yearlySettings);
      }
    }

    return savedYear;
  }

  /**
   * 年度別の評価基準の設定を更新
   */
  async updateYearlyCriteriaSettings(
    settingsData: Array<{
      id: number;
      weight: number;
      is_active: boolean;
    }>,
    academicYear: number
  ): Promise<boolean> {
    try {
      // 更新対象のIDリスト
      const ids = settingsData.map((s) => s.id);

      // これらのIDが指定された年度の設定であることを確認
      const existingSettings = await this.yearlySettingsRepository.find({
        where: {
          id: In(ids),
          academic_year: academicYear,
        },
      });

      if (existingSettings.length !== ids.length) {
        throw new Error(
          "一部の設定IDが見つからないか、指定された年度に属していません"
        );
      }

      // トランザクション内で一括更新
      await AppDataSource.transaction(async (transactionalEntityManager) => {
        for (const update of settingsData) {
          await transactionalEntityManager
            .createQueryBuilder()
            .update(YearlyCriteriaSetting)
            .set({
              weight: update.weight,
              is_active: update.is_active,
            })
            .where("id = :id", { id: update.id })
            .execute();
        }
      });

      return true;
    } catch (error) {
      console.error("年度別評価基準設定の更新中にエラーが発生しました:", error);
      return false;
    }
  }

  /**
   * AIを使った評価基準生成メソッド
   */
  async generateCriteriaWithAI(
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
    return this.criteriaGenerationService.generateCriteriaList(
      category,
      referenceUrls,
      count
    );
  }

  /**
   * 評価基準の説明をAIで改善
   */
  async improveCriteriaDescriptionWithAI(
    criteriaId: number
  ): Promise<EvaluationCriteria | null> {
    // 評価基準を取得
    const criteria = await this.criteriaRepository.findOne({
      where: { id: criteriaId },
    });

    if (!criteria) {
      return null;
    }

    try {
      // AIで説明を改善
      const improvedDescription =
        await this.criteriaGenerationService.improveDescription(
          criteria.key,
          criteria.name,
          criteria.description || ""
        );

      // 説明を更新
      criteria.description = improvedDescription;
      return this.criteriaRepository.save(criteria);
    } catch (error) {
      console.error("評価基準の説明改善中にエラーが発生しました:", error);
      return criteria; // 元の基準を返す
    }
  }

  /**
   * 全ての年度を取得
   */
  async getAllAcademicYears(): Promise<AcademicYearSetting[]> {
    return this.academicYearRepository.find({
      order: { academic_year: "DESC" },
    });
  }

  /**
   * 現在の年度を取得
   */
  async getCurrentAcademicYear(): Promise<AcademicYearSetting | null> {
    return this.academicYearRepository.findOne({
      where: { is_current: true },
    });
  }

  /**
   * 指定された評価基準の年度別設定を取得
   */
  async getYearlyCriteriaSettings(
    criteriaId: number
  ): Promise<YearlyCriteriaSetting[]> {
    return this.yearlySettingsRepository.find({
      where: { criteria_id: criteriaId },
      order: { academic_year: "DESC" },
    });
  }
}
