// backend/src/controllers/EvaluationCriteriaController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { EvaluationCriteriaService } from "../services/EvaluationCriteriaService";

export class EvaluationCriteriaController {
  private evaluationCriteriaService: EvaluationCriteriaService;

  constructor() {
    this.evaluationCriteriaService = EvaluationCriteriaService.getInstance();
  }

  /**
   * 全ての評価基準を取得
   */
  getAllCriteria = async (req: Request, res: Response): Promise<void> => {
    try {
      const criteria =
        await this.evaluationCriteriaService.getAllActiveCriteria();

      res.status(200).json({
        success: true,
        data: criteria,
      });
    } catch (error) {
      console.error("評価基準取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "評価基準の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 特定の年度の評価基準を取得
   */
  getCriteriaForYear = async (req: Request, res: Response): Promise<void> => {
    try {
      const year = parseInt(req.params.year);

      if (isNaN(year)) {
        res.status(400).json({
          success: false,
          message: "有効な年度を指定してください",
        });
        return;
      }

      const criteria =
        await this.evaluationCriteriaService.getActiveCriteriaForYear(year);

      res.status(200).json({
        success: true,
        data: criteria,
      });
    } catch (error) {
      console.error(`${req.params.year}年度の評価基準取得エラー:`, error);
      res.status(500).json({
        success: false,
        message: "年度別評価基準の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 現在の年度の評価基準を取得
   */
  getCurrentYearCriteria = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const criteria =
        await this.evaluationCriteriaService.getActiveCriteriaForCurrentYear();
      const currentYear =
        await this.evaluationCriteriaService.getCurrentAcademicYear();

      res.status(200).json({
        success: true,
        data: {
          criteria,
          currentYear: currentYear?.academic_year || new Date().getFullYear(),
          yearName: currentYear?.name || `${new Date().getFullYear()}年度`,
        },
      });
    } catch (error) {
      console.error("現在の年度の評価基準取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "現在の年度の評価基準の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 新しい評価基準を作成
   */
  createCriteria = async (req: Request, res: Response): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      // バリデーション
      const criteriaSchema = z.object({
        key: z.string().min(3, "キーは3文字以上必要です"),
        name: z.string().min(2, "名称は2文字以上必要です"),
        description: z.string().optional(),
        min_score: z.number().default(0),
        max_score: z.number().default(10),
        weight: z.number().min(0).default(1.0),
        is_active: z.boolean().default(true),
        display_order: z.number().default(0),
      });

      const validatedData = criteriaSchema.parse(req.body);

      // 評価基準の作成
      const criteria = await this.evaluationCriteriaService.createCriteria(
        validatedData
      );

      res.status(201).json({
        success: true,
        message: "評価基準が作成されました",
        data: criteria,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "入力データが不正です",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        console.error("評価基準作成エラー:", error);
        res.status(500).json({
          success: false,
          message: "評価基準の作成中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 評価基準を更新
   */
  updateCriteria = async (req: Request, res: Response): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      const key = req.params.key;

      // バリデーション
      const updateSchema = z.object({
        name: z.string().min(2, "名称は2文字以上必要です").optional(),
        description: z.string().optional(),
        min_score: z.number().optional(),
        max_score: z.number().optional(),
        weight: z.number().min(0).optional(),
        is_active: z.boolean().optional(),
        display_order: z.number().optional(),
      });

      const validatedData = updateSchema.parse(req.body);

      // 評価基準の更新
      const updatedCriteria =
        await this.evaluationCriteriaService.updateCriteria(key, validatedData);

      if (!updatedCriteria) {
        res.status(404).json({
          success: false,
          message: `キー '${key}' の評価基準が見つかりません`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "評価基準が更新されました",
        data: updatedCriteria,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "入力データが不正です",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        console.error("評価基準更新エラー:", error);
        res.status(500).json({
          success: false,
          message: "評価基準の更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 評価基準を無効化
   */
  deactivateCriteria = async (req: Request, res: Response): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      const key = req.params.key;

      // 評価基準の無効化
      const result = await this.evaluationCriteriaService.deactivateCriteria(
        key
      );

      if (!result) {
        res.status(404).json({
          success: false,
          message: `キー '${key}' の評価基準が見つかりません`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "評価基準が無効化されました",
      });
    } catch (error) {
      console.error("評価基準無効化エラー:", error);
      res.status(500).json({
        success: false,
        message: "評価基準の無効化中にエラーが発生しました",
      });
    }
  };

  /**
   * 評価基準の表示順を一括更新
   */
  bulkUpdateCriteria = async (req: Request, res: Response): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      // バリデーション
      const updateSchema = z.array(
        z.object({
          id: z.number(),
          display_order: z.number(),
          weight: z.number().optional(),
          is_active: z.boolean().optional(),
        })
      );

      const validatedData = updateSchema.parse(req.body);

      // 一括更新
      const result = await this.evaluationCriteriaService.bulkUpdateCriteria(
        validatedData
      );

      res.status(200).json({
        success: result,
        message: result
          ? "評価基準が一括更新されました"
          : "評価基準の一括更新に失敗しました",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "入力データが不正です",
          errors: error.errors,
        });
      } else {
        console.error("評価基準一括更新エラー:", error);
        res.status(500).json({
          success: false,
          message: "評価基準の一括更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 年度を作成・更新
   */
  createOrUpdateAcademicYear = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      // バリデーション
      const yearSchema = z.object({
        academic_year: z.number().int().min(2000).max(2100),
        name: z.string().min(2, "名称は2文字以上必要です"),
        description: z.string().optional(),
        is_current: z.boolean().default(false),
      });

      const validatedData = yearSchema.parse(req.body);

      // 年度の作成・更新
      const year =
        await this.evaluationCriteriaService.createOrUpdateAcademicYear(
          validatedData.academic_year,
          validatedData.name,
          validatedData.is_current,
          validatedData.description
        );

      res.status(200).json({
        success: true,
        message: "年度が作成・更新されました",
        data: year,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "入力データが不正です",
          errors: error.errors,
        });
      } else {
        console.error("年度作成・更新エラー:", error);
        res.status(500).json({
          success: false,
          message: "年度の作成・更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * 全ての年度を取得
   */
  getAllAcademicYears = async (req: Request, res: Response): Promise<void> => {
    try {
      const years = await this.evaluationCriteriaService.getAllAcademicYears();

      res.status(200).json({
        success: true,
        data: years,
      });
    } catch (error) {
      console.error("年度一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "年度一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 評価基準の年度別設定を更新
   */
  updateYearlyCriteriaSettings = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      // バリデーション
      const updateSchema = z.object({
        academic_year: z.number().int().min(2000).max(2100),
        settings: z.array(
          z.object({
            id: z.number(),
            weight: z.number().min(0),
            is_active: z.boolean(),
          })
        ),
      });

      const validatedData = updateSchema.parse(req.body);

      // 年度別設定の更新
      const result =
        await this.evaluationCriteriaService.updateYearlyCriteriaSettings(
          validatedData.settings,
          validatedData.academic_year
        );

      res.status(200).json({
        success: result,
        message: result
          ? "年度別評価基準設定が更新されました"
          : "更新に失敗しました",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "入力データが不正です",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        console.error("年度別評価基準設定更新エラー:", error);
        res.status(500).json({
          success: false,
          message: "年度別評価基準設定の更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * AIを使用して評価基準の候補を生成
   */
  generateCriteriaWithAI = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      // バリデーション
      const generateSchema = z.object({
        category: z.string().min(1, "カテゴリ名は必須です"),
        referenceUrls: z.array(z.string().url()).optional(),
        count: z.number().int().min(1).max(10).default(5),
      });

      const validatedData = generateSchema.parse(req.body);

      // AI生成
      const generatedCriteria =
        await this.evaluationCriteriaService.generateCriteriaWithAI(
          validatedData.category,
          validatedData.referenceUrls,
          validatedData.count
        );

      res.status(200).json({
        success: true,
        message: "AI生成による評価基準候補が作成されました",
        data: generatedCriteria,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "入力データが不正です",
          errors: error.errors,
        });
      } else {
        console.error("AI評価基準生成エラー:", error);
        res.status(500).json({
          success: false,
          message: "評価基準のAI生成中にエラーが発生しました",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * 評価基準の説明をAIで改善
   */
  improveCriteriaDescription = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // 管理者権限の確認
      if (req.user?.role !== "admin") {
        res.status(403).json({
          success: false,
          message: "この操作を行う権限がありません",
        });
        return;
      }

      const criteriaId = parseInt(req.params.id);

      if (isNaN(criteriaId)) {
        res.status(400).json({
          success: false,
          message: "有効な評価基準IDを指定してください",
        });
        return;
      }

      // AI改善
      const improvedCriteria =
        await this.evaluationCriteriaService.improveCriteriaDescriptionWithAI(
          criteriaId
        );

      if (!improvedCriteria) {
        res.status(404).json({
          success: false,
          message: "指定された評価基準が見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "評価基準の説明が改善されました",
        data: improvedCriteria,
      });
    } catch (error) {
      console.error("評価基準説明改善エラー:", error);
      res.status(500).json({
        success: false,
        message: "評価基準の説明改善中にエラーが発生しました",
      });
    }
  };
}
