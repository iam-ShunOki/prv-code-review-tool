// backend/src/controllers/AnalyticsExportController.ts
import { Request, Response } from "express";
import { AnalyticsService } from "../services/AnalyticsService";
import { UserService } from "../services/UserService";
import { EvaluationService } from "../services/EvaluationService";
import { EvaluationCriteriaService } from "../services/EvaluationCriteriaService";
import Excel from "exceljs";
import { z } from "zod";
import PdfPrinter from "pdfmake";
import * as fs from "fs";
import * as path from "path";
import { TDocumentDefinitions, ContentColumns } from "pdfmake/interfaces";
import { LangChainAIService } from "../services/LangChainAIService";

export class AnalyticsExportController {
  private analyticsService: AnalyticsService;
  private userService: UserService;
  private evaluationService: EvaluationService;
  private langChainService: LangChainAIService;

  constructor() {
    this.analyticsService = new AnalyticsService();
    this.userService = new UserService();
    this.evaluationService = new EvaluationService();
    this.langChainService = new LangChainAIService();
  }

  /**
   * レポートをエクスポートする
   */
  exportReport = async (req: Request, res: Response): Promise<void> => {
    try {
      // パラメータのバリデーション
      const exportSchema = z.object({
        format: z.enum(["excel", "pdf", "markdown", "graphic"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        joinYear: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val) : undefined)),
        department: z.string().optional(),
        includeDetails: z
          .enum(["true", "false"])
          .optional()
          .transform((val) => val === "true"),
        includeGrowthTrend: z
          .enum(["true", "false"])
          .optional()
          .transform((val) => val === "true"),
        includePrediction: z
          .enum(["true", "false"])
          .optional()
          .transform((val) => val === "true"),
        useAI: z
          .enum(["true", "false"])
          .optional()
          .transform((val) => val === "true"),
      });

      const {
        format,
        startDate,
        endDate,
        joinYear,
        department,
        includeDetails = true,
        includeGrowthTrend = true,
        includePrediction = true,
        useAI = false,
      } = exportSchema.parse(req.query);

      // 実行者の情報を取得
      const executorId = req.user?.id;
      if (!executorId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      const executor = await this.userService.findById(executorId);
      if (!executor) {
        res.status(404).json({
          success: false,
          message: "ユーザーが見つかりません",
        });
        return;
      }

      // レポートのデータを集める
      const reportData = await this.gatherReportData(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
        joinYear,
        department,
        includeDetails,
        includeGrowthTrend,
        includePrediction,
        useAI
      );

      // 出力形式に応じてレポートを生成して返す
      switch (format) {
        case "excel":
          const excelBuffer = await this.generateExcelReport(
            reportData,
            executor
          );
          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="analytics_report_${
              new Date().toISOString().split("T")[0]
            }.xlsx"`
          );
          res.send(excelBuffer);
          break;

        case "pdf":
          const pdfDoc = await this.generatePDFReport(reportData, executor);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="analytics_report_${
              new Date().toISOString().split("T")[0]
            }.pdf"`
          );
          res.send(pdfDoc);
          break;

        case "markdown":
          const markdown = await this.generateMarkdownReport(
            reportData,
            executor
          );
          res.setHeader("Content-Type", "text/markdown");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="analytics_report_${
              new Date().toISOString().split("T")[0]
            }.md"`
          );
          res.send(markdown);
          break;

        case "graphic":
          const graphicBuffer = await this.generateGraphicReport(
            reportData,
            executor
          );
          res.setHeader("Content-Type", "image/svg+xml");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="analytics_report_${
              new Date().toISOString().split("T")[0]
            }.svg"`
          );
          res.send(graphicBuffer);
          break;

        default:
          throw new Error("サポートされていない出力形式です");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "予期せぬエラーが発生しました",
        });
      }
    }
  };

  /**
   * レポートのデータを収集する
   */
  private async gatherReportData(
    startDate?: Date,
    endDate?: Date,
    joinYear?: number,
    department?: string,
    includeDetails: boolean = true,
    includeGrowthTrend: boolean = true,
    includePrediction: boolean = true,
    useAI: boolean = false
  ): Promise<any> {
    // 新入社員数
    const trainees = await this.userService.getFilteredEmployees(
      joinYear,
      department
    );

    // スキルレベル分布
    const skillDistribution = await this.analyticsService.getSkillDistribution(
      joinYear,
      department
    );

    // 成長推移
    let growthTrend = [];
    if (includeGrowthTrend) {
      growthTrend = await this.analyticsService.getGrowthTrend(
        joinYear,
        department
      );
    }

    // 各社員の評価データ
    let employeeEvaluations: any[] = [];
    if (includeDetails) {
      employeeEvaluations = await Promise.all(
        trainees.map(async (trainee) => {
          const latestEvaluation =
            await this.evaluationService.getLatestEvaluationByUserId(
              trainee.id
            );
          return {
            id: trainee.id,
            name: trainee.name,
            department: trainee.department,
            join_year: trainee.join_year,
            evaluation: latestEvaluation,
          };
        })
      );
    }

    // 今後の傾向（分析サービスで予測したもの）
    let futureTrend = "";
    if (includePrediction) {
      futureTrend = await this.analyticsService.predictFutureTrend(
        joinYear,
        department
      );
    }

    // AIによるデータ解釈と提案（Claude 3.7 Sonnetを使用）
    let aiInsights = null;
    if (useAI) {
      try {
        aiInsights = await this.langChainService.generateAnalyticsInsights({
          trainees,
          skillDistribution,
          growthTrend,
          employeeEvaluations,
          futureTrend,
        });
      } catch (error) {
        console.error("AI insights generation error:", error);
        aiInsights = {
          summary: "AIによる分析データを生成できませんでした。",
          keyFindings: [],
          recommendations: [],
        };
      }
    }

    return {
      trainees,
      traineeCount: trainees.length,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      skillDistribution,
      growthTrend,
      employeeEvaluations,
      futureTrend,
      aiInsights,
      generatedAt: new Date(),
      filterParams: {
        joinYear,
        department,
      },
    };
  }

  /**
   * 柔軟な評価基準に対応したExcelレポートを生成
   */
  private async generateExcelReport(data: any, executor: any): Promise<Buffer> {
    const workbook = new Excel.Workbook();
    const criteriaService = EvaluationCriteriaService.getInstance();

    // ワークブックのプロパティを設定
    workbook.creator = executor.name;
    workbook.lastModifiedBy = executor.name;
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.date1904 = false;

    // カラーパレットの定義
    const COLORS = {
      PRIMARY: { hex: "4472C4" },
      SECONDARY: { hex: "70AD47" },
      ACCENT1: { hex: "ED7D31" },
      ACCENT2: { hex: "FFC000" },
      ACCENT3: { hex: "5B9BD5" },
      ACCENT4: { hex: "A5A5A5" },
      LIGHT_BG1: { hex: "F2F2F2" },
      LIGHT_BG2: { hex: "DDEBF7" },
      LIGHT_BG3: { hex: "E2EFDA" },
      DARK_TEXT: { hex: "44546A" },
      LEVEL_A: { hex: "4CAF50" },
      LEVEL_B: { hex: "8BC34A" },
      LEVEL_C: { hex: "FFEB3B" },
      LEVEL_D: { hex: "FF9800" },
      LEVEL_E: { hex: "F44336" },
    };

    // 共通スタイル
    const STYLES = {
      title: {
        font: { size: 18, bold: true, color: { argb: COLORS.PRIMARY.hex } },
        alignment: { horizontal: "center", vertical: "middle" },
      },
      subtitle: {
        font: { size: 14, bold: true, color: { argb: COLORS.DARK_TEXT.hex } },
        alignment: { horizontal: "left", vertical: "middle" },
      },
      sectionHeader: {
        font: { size: 12, bold: true, color: { argb: COLORS.PRIMARY.hex } },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.LIGHT_BG2.hex },
        },
        alignment: { horizontal: "left", vertical: "middle" },
        border: {
          bottom: { style: "thin", color: { argb: COLORS.PRIMARY.hex } },
        },
      },
      tableHeader: {
        font: { bold: true, color: { argb: "FFFFFF" } },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.PRIMARY.hex },
        },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true },
        border: {
          top: { style: "thin", color: { argb: "FFFFFF" } },
          bottom: { style: "thin", color: { argb: "FFFFFF" } },
          left: { style: "thin", color: { argb: "FFFFFF" } },
          right: { style: "thin", color: { argb: "FFFFFF" } },
        },
      },
      tableCell: {
        alignment: { vertical: "middle" },
        border: {
          top: { style: "thin", color: { argb: "D9D9D9" } },
          bottom: { style: "thin", color: { argb: "D9D9D9" } },
          left: { style: "thin", color: { argb: "D9D9D9" } },
          right: { style: "thin", color: { argb: "D9D9D9" } },
        },
      },
      infoLabel: {
        font: { bold: true, color: { argb: COLORS.DARK_TEXT.hex } },
        alignment: { horizontal: "right", vertical: "middle" },
      },
      infoValue: {
        alignment: { horizontal: "left", vertical: "middle" },
      },
      note: {
        font: { italic: true, size: 9, color: { argb: COLORS.ACCENT4.hex } },
        alignment: { horizontal: "left", vertical: "middle" },
      },
    };

    // 共通の関数: セルスタイルの適用
    const applyStyle = (cell: Excel.Cell, style: any) => {
      cell.font = style.font;
      cell.alignment = style.alignment;
      if (style.fill) cell.fill = style.fill;
      if (style.border) cell.border = style.border;
      if (style.numFmt) cell.numFmt = style.numFmt;
    };

    // 共通の関数: 表のヘッダーを作成
    const createTableHeader = (
      worksheet: Excel.Worksheet,
      headerRow: number,
      headers: string[],
      startCol: string = "A",
      rowHeight: number = 30
    ) => {
      worksheet.getRow(headerRow).height = rowHeight;
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(
          `${String.fromCharCode(startCol.charCodeAt(0) + index)}${headerRow}`
        );
        cell.value = header;
        applyStyle(cell, STYLES.tableHeader);
      });
    };

    // 共通の関数: セクションヘッダーを作成
    const createSectionHeader = (
      worksheet: Excel.Worksheet,
      row: number,
      title: string,
      span: number = 1,
      startCol: string = "A"
    ) => {
      const endCol = String.fromCharCode(startCol.charCodeAt(0) + span - 1);
      if (span > 1) {
        worksheet.mergeCells(`${startCol}${row}:${endCol}${row}`);
      }
      const cell = worksheet.getCell(`${startCol}${row}`);
      cell.value = title;
      applyStyle(cell, STYLES.sectionHeader);
      worksheet.getRow(row).height = 25;
      return row + 1;
    };

    // 評価基準のマッピングを取得（動的に評価基準キーから表示名を取得）
    let criteriaMapping: Record<string, string> = {};
    try {
      criteriaMapping = await criteriaService.getCriteriaMapping();
    } catch (error) {
      console.warn("評価基準マッピングの取得に失敗しました:", error);
      // デフォルト値（エラー時の代替）
      criteriaMapping = {
        code_quality_score: "コード品質",
        readability_score: "可読性",
        efficiency_score: "効率性",
        best_practices_score: "ベストプラクティス",
      };
    }

    // 有効な評価基準のリストを取得
    let activeCriteria: any[] = [];
    try {
      activeCriteria = await criteriaService.getAllActiveCriteria();
    } catch (error) {
      console.warn("有効な評価基準の取得に失敗しました:", error);
      activeCriteria = [];
    }

    // ========== サマリーシート ==========
    const summarySheet = workbook.addWorksheet("サマリー", {
      properties: { tabColor: { argb: COLORS.PRIMARY.hex } },
    });

    // カラム幅の設定
    summarySheet.columns = [
      { key: "A", width: 15 },
      { key: "B", width: 20 },
      { key: "C", width: 15 },
      { key: "D", width: 20 },
      { key: "E", width: 20 },
      { key: "F", width: 25 },
    ];

    // タイトル
    summarySheet.mergeCells("A1:F1");
    const titleCell = summarySheet.getCell("A1");
    titleCell.value = "コードレビューツール 分析レポート";
    applyStyle(titleCell, STYLES.title);
    summarySheet.getRow(1).height = 40;

    // サブタイトルと日付
    summarySheet.mergeCells("A2:F2");
    const subtitleCell = summarySheet.getCell("A2");
    subtitleCell.value = `生成日: ${new Date().toLocaleDateString("ja-JP")}`;
    subtitleCell.alignment = { horizontal: "right" };
    subtitleCell.font = { italic: true, color: { argb: COLORS.ACCENT4.hex } };

    // ロゴまたはイメージを追加（仮想的に枠を作成）
    summarySheet.mergeCells("A3:B6");
    const logoCell = summarySheet.getCell("A3");
    logoCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "F0F0F0" },
    };
    logoCell.value = "コードレビューツール";
    logoCell.alignment = { horizontal: "center", vertical: "middle" };
    logoCell.font = {
      bold: true,
      size: 14,
      color: { argb: COLORS.PRIMARY.hex },
    };

    // 基本情報ブロック
    let row = 3;
    summarySheet.mergeCells(`C${row}:F${row}`);
    const infoHeaderCell = summarySheet.getCell(`C${row}`);
    infoHeaderCell.value = "レポート基本情報";
    applyStyle(infoHeaderCell, STYLES.subtitle);

    // 情報テーブル
    const infoData = [
      {
        label: "出力者",
        value: `${executor.name} (${executor.department || "部署未設定"})`,
      },
      {
        label: "対象期間",
        value:
          data.period.startDate && data.period.endDate
            ? `${new Date(data.period.startDate).toLocaleDateString(
                "ja-JP"
              )} 〜 ${new Date(data.period.endDate).toLocaleDateString(
                "ja-JP"
              )}`
            : "全期間",
      },
      { label: "新入社員数", value: data.traineeCount + "名" },
      {
        label: "対象入社年度",
        value: data.filterParams?.joinYear
          ? data.filterParams.joinYear
          : "全年度",
      },
      { label: "対象部署", value: data.filterParams?.department || "全部署" },
    ];

    infoData.forEach((info, index) => {
      row = 4 + index;
      const labelCell = summarySheet.getCell(`C${row}`);
      const valueCell = summarySheet.getCell(`D${row}`);
      labelCell.value = info.label + ":";
      valueCell.value = info.value;
      summarySheet.mergeCells(`D${row}:F${row}`);
      applyStyle(labelCell, STYLES.infoLabel);
      applyStyle(valueCell, STYLES.infoValue);
    });

    // KPIサマリーブロック
    row = 9;
    summarySheet.mergeCells(`A${row}:F${row}`);
    const kpiHeaderCell = summarySheet.getCell(`A${row}`);
    kpiHeaderCell.value = "KPIサマリー";
    applyStyle(kpiHeaderCell, STYLES.subtitle);
    row++;

    // KPIカード（各レベルの人数を視覚的に表示）
    row = 10;
    const skillLevels = ["A", "B", "C", "D", "E"];
    const levelColors = [
      COLORS.LEVEL_A.hex,
      COLORS.LEVEL_B.hex,
      COLORS.LEVEL_C.hex,
      COLORS.LEVEL_D.hex,
      COLORS.LEVEL_E.hex,
    ];

    const levelLabels = ["卓越", "優秀", "良好", "要改善", "基礎段階"];

    // レベル別カード（横並び）
    skillLevels.forEach((level, index) => {
      const col = String.fromCharCode("A".charCodeAt(0) + index);
      const count =
        data.skillDistribution?.find((d: any) => d.level === level)?.count || 0;
      const percentage =
        data.traineeCount > 0
          ? ((count / data.traineeCount) * 100).toFixed(1)
          : "0.0";

      // レベルカード
      const levelCell = summarySheet.getCell(`${col}${row}`);
      levelCell.value = `レベル ${level}`;
      levelCell.alignment = { horizontal: "center", vertical: "middle" };
      levelCell.font = { bold: true, color: { argb: "FFFFFF" } };
      levelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: levelColors[index] },
      };
      summarySheet.getRow(row).height = 25;

      // 人数
      const countCell = summarySheet.getCell(`${col}${row + 1}`);
      countCell.value = count + "名";
      countCell.alignment = { horizontal: "center", vertical: "middle" };
      countCell.font = { bold: true, size: 14 };

      // 割合
      const percentCell = summarySheet.getCell(`${col}${row + 2}`);
      percentCell.value = percentage + "%";
      percentCell.alignment = { horizontal: "center", vertical: "middle" };
      percentCell.font = { size: 11, color: { argb: COLORS.ACCENT4.hex } };

      // 説明
      const descCell = summarySheet.getCell(`${col}${row + 3}`);
      descCell.value = levelLabels[index];
      descCell.alignment = { horizontal: "center", vertical: "middle" };
      descCell.font = { italic: true, size: 10 };
    });
    row += 5; // KPIカードの高さ分進める

    // スキルレベル分布
    row++;
    const distributionHeaderRow = createSectionHeader(
      summarySheet,
      row,
      "スキルレベル分布",
      6
    );
    row = distributionHeaderRow + 1;

    // テーブルヘッダー
    createTableHeader(summarySheet, row, ["レベル", "人数", "割合"], "A");
    row++;

    // レベル分布データ
    skillLevels.forEach((level, index) => {
      const count =
        data.skillDistribution?.find((d: any) => d.level === level)?.count || 0;
      const percentage =
        data.traineeCount > 0
          ? ((count / data.traineeCount) * 100).toFixed(1)
          : "0.0";

      const rowData = [level, count, `${percentage}%`];
      rowData.forEach((value, colIndex) => {
        const cell = summarySheet.getCell(
          `${String.fromCharCode("A".charCodeAt(0) + colIndex)}${row}`
        );
        cell.value = value;
        applyStyle(cell, STYLES.tableCell);

        // レベルセルに色を付ける
        if (colIndex === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: levelColors[index] },
          };
          cell.font = { bold: true, color: { argb: "FFFFFF" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      row++;
    });

    // データ可視化のためのスペースを確保
    row += 2;
    summarySheet.mergeCells(`A${row}:F${row}`);
    const chartHeaderCell = summarySheet.getCell(`A${row}`);
    chartHeaderCell.value = "データ可視化（Excelで開くとグラフが表示されます）";
    chartHeaderCell.font = {
      italic: true,
      color: { argb: COLORS.ACCENT4.hex },
    };
    chartHeaderCell.alignment = { horizontal: "center" };

    // ========== 成長推移シート ==========
    if (data.growthTrend && data.growthTrend.length > 0) {
      const growthSheet = workbook.addWorksheet("成長推移", {
        properties: { tabColor: { argb: COLORS.SECONDARY.hex } },
      });

      // カラム幅の設定
      growthSheet.columns = [
        { key: "A", width: 15 },
        { key: "B", width: 20 },
        { key: "C", width: 20 },
        { key: "D", width: 25 },
        { key: "E", width: 15 },
      ];

      // タイトル
      growthSheet.mergeCells("A1:E1");
      const growthTitleCell = growthSheet.getCell("A1");
      growthTitleCell.value = "成長推移データ";
      applyStyle(growthTitleCell, STYLES.title);
      growthSheet.getRow(1).height = 30;

      // 説明テキスト
      growthSheet.mergeCells("A2:E2");
      const growthDescCell = growthSheet.getCell("A2");
      growthDescCell.value = "期間ごとの平均スキルレベルと成長率の推移";
      growthDescCell.font = { italic: true };
      growthDescCell.alignment = { horizontal: "center" };

      // データテーブル
      row = 4;
      createTableHeader(growthSheet, row, [
        "期間",
        "平均スキルレベル",
        "成長率(%)",
        "備考",
      ]);
      row++;

      // 成長推移データ
      data.growthTrend.forEach((point: any, index: number) => {
        const trend = point.growthRate >= 0 ? "↑ 上昇" : "↓ 下降";
        const trendColor =
          point.growthRate >= 0 ? COLORS.SECONDARY.hex : COLORS.LEVEL_E.hex;

        const rowData = [
          point.period,
          point.averageLevel.toFixed(2),
          `${point.growthRate.toFixed(1)}%`,
          trend,
        ];

        rowData.forEach((value, colIndex) => {
          const cell = growthSheet.getCell(
            `${String.fromCharCode("A".charCodeAt(0) + colIndex)}${row}`
          );
          cell.value = value;
          applyStyle(cell, STYLES.tableCell);

          // 成長率に条件付き書式
          if (colIndex === 2) {
            cell.font = {
              color: { argb: trendColor },
              bold: true,
            };
          }

          // トレンド指標に色付け
          if (colIndex === 3) {
            cell.font = {
              color: { argb: trendColor },
              bold: true,
            };
          }
        });
        row++;
      });

      // 成長率のヒートマップ（視覚的表現）
      row += 3;
      growthSheet.mergeCells(`A${row}:E${row}`);
      const heatmapHeaderCell = growthSheet.getCell(`A${row}`);
      heatmapHeaderCell.value = "成長率ヒートマップ";
      applyStyle(heatmapHeaderCell, STYLES.subtitle);
      row++;

      // 期間ラベル行
      data.growthTrend.forEach((point: any, index: number) => {
        const cell = growthSheet.getCell(
          `${String.fromCharCode("B".charCodeAt(0) + index)}${row}`
        );
        cell.value = point.period;
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = { bold: true };
      });
      row++;

      // ヒートマップ表現
      data.growthTrend.forEach((point: any, index: number) => {
        const cell = growthSheet.getCell(
          `${String.fromCharCode("B".charCodeAt(0) + index)}${row}`
        );
        cell.value = point.averageLevel.toFixed(1);
        cell.alignment = { horizontal: "center", vertical: "middle" };

        // ヒートマップ色の計算（レベルによって色を変化）
        let heatColor;
        if (point.averageLevel >= 4.5) {
          heatColor = COLORS.LEVEL_A.hex;
        } else if (point.averageLevel >= 3.5) {
          heatColor = COLORS.LEVEL_B.hex;
        } else if (point.averageLevel >= 2.5) {
          heatColor = COLORS.LEVEL_C.hex;
        } else if (point.averageLevel >= 1.5) {
          heatColor = COLORS.LEVEL_D.hex;
        } else {
          heatColor = COLORS.LEVEL_E.hex;
        }

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: heatColor },
        };

        // 色によってフォント色を調整
        if (point.averageLevel >= 3.5) {
          cell.font = { color: { argb: "000000" }, bold: true }; // 明るい背景には黒テキスト
        } else {
          cell.font = { color: { argb: "FFFFFF" }, bold: true }; // 暗い背景には白テキスト
        }
      });

      // ラベル
      const labelCell = growthSheet.getCell(`A${row}`);
      labelCell.value = "平均レベル";
      labelCell.alignment = { horizontal: "right", vertical: "middle" };
      labelCell.font = { bold: true };

      // 成長率ヒートマップ行
      row += 2;

      // 期間ラベル行は再利用

      // 成長率ヒートマップ
      row++;
      data.growthTrend.forEach((point: any, index: number) => {
        const cell = growthSheet.getCell(
          `${String.fromCharCode("B".charCodeAt(0) + index)}${row}`
        );
        cell.value = `${point.growthRate.toFixed(1)}%`;
        cell.alignment = { horizontal: "center", vertical: "middle" };

        // 成長率に応じた色の計算
        let trendColor;
        if (point.growthRate >= 15) {
          trendColor = COLORS.LEVEL_A.hex; // 高成長
        } else if (point.growthRate >= 5) {
          trendColor = COLORS.LEVEL_B.hex; // 中成長
        } else if (point.growthRate >= 0) {
          trendColor = COLORS.LEVEL_C.hex; // 微増
        } else if (point.growthRate >= -5) {
          trendColor = COLORS.LEVEL_D.hex; // 微減
        } else {
          trendColor = COLORS.LEVEL_E.hex; // 減少
        }

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: trendColor },
        };

        // 色によってフォント色を調整
        if (point.growthRate >= 0) {
          cell.font = { color: { argb: "000000" }, bold: true }; // 明るい背景には黒テキスト
        } else {
          cell.font = { color: { argb: "FFFFFF" }, bold: true }; // 暗い背景には白テキスト
        }
      });

      // ラベル
      const growthLabelCell = growthSheet.getCell(`A${row}`);
      growthLabelCell.value = "成長率";
      growthLabelCell.alignment = { horizontal: "right", vertical: "middle" };
      growthLabelCell.font = { bold: true };

      // グラフのためのプレースホルダー
      row += 3;
      growthSheet.mergeCells(`A${row}:E${row}`);
      const chartPlaceholderCell = growthSheet.getCell(`A${row}`);
      chartPlaceholderCell.value =
        "※ Excelで開くと、このスペースに成長推移グラフが表示されます";
      chartPlaceholderCell.font = {
        italic: true,
        color: { argb: COLORS.ACCENT4.hex },
      };
      chartPlaceholderCell.alignment = { horizontal: "center" };
    }

    // ========== 社員詳細シート ==========
    if (data.employeeEvaluations && data.employeeEvaluations.length > 0) {
      const detailSheet = workbook.addWorksheet("社員詳細", {
        properties: { tabColor: { argb: COLORS.ACCENT3.hex } },
      });

      // 有効な評価基準からカラム設定を動的に生成
      const baseColumns = [
        { key: "id", width: 8 },
        { key: "name", width: 20 },
        { key: "department", width: 20 },
        { key: "joinYear", width: 15 },
        { key: "level", width: 10 },
      ];

      // 評価基準のカラムを動的に追加
      const criteriaColumns = activeCriteria.map((c) => ({
        key: `${c.key}_score`,
        width: 15,
        header: c.name,
      }));

      // 総合スコアカラム
      const totalScoreColumn = { key: "totalScore", width: 15 };

      // カラムをマージして設定
      detailSheet.columns = [
        ...baseColumns,
        ...criteriaColumns,
        totalScoreColumn,
      ];

      // 動的にヘッダー行を作成
      const headers = [
        "ID",
        "名前",
        "部署",
        "入社年度",
        "スキルレベル",
        ...activeCriteria.map((c) => c.name),
        "総合スコア",
      ];

      // タイトル
      detailSheet.mergeCells(
        `A1:${String.fromCharCode("A".charCodeAt(0) + headers.length - 1)}1`
      );
      const detailTitleCell = detailSheet.getCell("A1");
      detailTitleCell.value = "社員詳細評価";
      applyStyle(detailTitleCell, STYLES.title);
      detailSheet.getRow(1).height = 30;

      // テーブルヘッダー
      createTableHeader(detailSheet, 3, headers);

      // データ入力
      data.employeeEvaluations.forEach((employee: any, index: number) => {
        const rowIndex = index + 4;

        const idCell = detailSheet.getCell(`A${rowIndex}`);
        idCell.value = employee.id;
        applyStyle(idCell, STYLES.tableCell);
        idCell.alignment = { horizontal: "center" };

        const nameCell = detailSheet.getCell(`B${rowIndex}`);
        nameCell.value = employee.name;
        applyStyle(nameCell, STYLES.tableCell);

        const deptCell = detailSheet.getCell(`C${rowIndex}`);
        deptCell.value = employee.department || "未設定";
        applyStyle(deptCell, STYLES.tableCell);

        const joinYearCell = detailSheet.getCell(`D${rowIndex}`);
        joinYearCell.value = employee.join_year || "未設定";
        applyStyle(joinYearCell, STYLES.tableCell);
        joinYearCell.alignment = { horizontal: "center" };

        if (employee.evaluation) {
          // レベルセル
          const levelCell = detailSheet.getCell(`E${rowIndex}`);
          levelCell.value = employee.evaluation.overall_level;
          applyStyle(levelCell, STYLES.tableCell);
          levelCell.alignment = { horizontal: "center" };

          // レベルに応じた背景色
          const levelIndex = skillLevels.indexOf(
            employee.evaluation.overall_level
          );
          if (levelIndex >= 0) {
            levelCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: levelColors[levelIndex] },
            };

            // 明るい背景には黒テキスト、暗い背景には白テキスト
            if (levelIndex >= 2) {
              levelCell.font = { bold: true, color: { argb: "000000" } };
            } else {
              levelCell.font = { bold: true, color: { argb: "FFFFFF" } };
            }
          }

          // 各評価基準スコアを動的に処理
          let columnIndex = 5; // A=0, B=1, ... E=4, F=5 (最初の評価基準カラム)
          let totalScoreSum = 0;
          let totalWeight = 0;

          // 各評価基準ごとにセルを生成
          activeCriteria.forEach((criteria) => {
            const scoreKey = `${criteria.key}_score`;
            const scoreValue = employee.evaluation[scoreKey];
            const colLetter = String.fromCharCode(
              "A".charCodeAt(0) + columnIndex
            );

            // スコアセルの設定
            const scoreCell = detailSheet.getCell(`${colLetter}${rowIndex}`);

            if (scoreValue !== undefined && scoreValue !== null) {
              scoreCell.value = scoreValue;

              // 重み付け計算
              totalScoreSum += scoreValue * criteria.weight;
              totalWeight += criteria.weight;

              // 条件付き書式（スコアの高さで色分け）
              const maxScore = criteria.max_score || 10;
              const scoreRatio = scoreValue / maxScore;

              if (scoreRatio >= 0.8) {
                scoreCell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: { argb: "E2EFDA" },
                }; // 緑
              } else if (scoreRatio >= 0.6) {
                scoreCell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: { argb: "FFF2CC" },
                }; // 黄
              } else if (scoreRatio < 0.4) {
                scoreCell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: { argb: "FCE4D6" },
                }; // 赤
              }
            } else {
              scoreCell.value = "-";
            }

            applyStyle(scoreCell, STYLES.tableCell);
            scoreCell.alignment = { horizontal: "center" };
            columnIndex++;
          });

          // 総合スコアを計算（重み付け平均）
          const totalScore = totalWeight > 0 ? totalScoreSum / totalWeight : 0;
          const totalScoreCell = detailSheet.getCell(
            `${String.fromCharCode("A".charCodeAt(0) + columnIndex)}${rowIndex}`
          );
          totalScoreCell.value = parseFloat(totalScore.toFixed(1));
          applyStyle(totalScoreCell, STYLES.tableCell);
          totalScoreCell.alignment = { horizontal: "center" };
          totalScoreCell.font = { bold: true };

          // 総合スコアの条件付き書式
          if (totalScore >= 8) {
            totalScoreCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "C6EFCE" },
            }; // 濃い緑
            totalScoreCell.font = { bold: true, color: { argb: "006100" } };
          } else if (totalScore >= 6) {
            totalScoreCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFEB9C" },
            }; // 濃い黄
            totalScoreCell.font = { bold: true, color: { argb: "9C5700" } };
          } else if (totalScore < 4) {
            totalScoreCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFC7CE" },
            }; // 濃い赤
            totalScoreCell.font = { bold: true, color: { argb: "9C0006" } };
          }
        } else {
          // 評価なしの場合、残りのすべてのセルを「評価なし」または「-」で埋める
          let colIndex = 4; // Eカラムから
          const remainingCols = headers.length - colIndex;

          for (let i = 0; i < remainingCols; i++) {
            const col = String.fromCharCode("A".charCodeAt(0) + colIndex + i);
            const cell = detailSheet.getCell(`${col}${rowIndex}`);
            cell.value = i === 0 ? "評価なし" : "-";
            applyStyle(cell, STYLES.tableCell);
            cell.alignment = { horizontal: "center" };

            if (i === 0) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "F2F2F2" },
              }; // 灰色
            }
          }
        }
      });

      // 評価指標の説明
      const legendRow = data.employeeEvaluations.length + 6;
      detailSheet.mergeCells(
        `A${legendRow}:${String.fromCharCode(
          "A".charCodeAt(0) + headers.length - 1
        )}${legendRow}`
      );
      const legendTitleCell = detailSheet.getCell(`A${legendRow}`);
      legendTitleCell.value = "評価指標の説明";
      applyStyle(legendTitleCell, STYLES.subtitle);

      // 各スキルレベルの説明
      const levelDesc = [
        {
          level: "A",
          desc: "卓越したスキルレベル。チームリーダーとして活躍できる能力を持つ。",
        },
        {
          level: "B",
          desc: "優れたスキルレベル。自立的に作業し、複雑な課題にも対応できる。",
        },
        {
          level: "C",
          desc: "良好なスキルレベル。基本的なタスクを自力で完了できる。",
        },
        {
          level: "D",
          desc: "改善が必要なスキルレベル。基本的な概念を理解しているが、実践力は限られている。",
        },
        {
          level: "E",
          desc: "基礎的なスキルレベル。継続的なサポートとガイダンスが必要。",
        },
      ];

      levelDesc.forEach((item, index) => {
        const row = legendRow + 2 + index;

        const levelCell = detailSheet.getCell(`A${row}`);
        levelCell.value = `レベル ${item.level}`;
        levelCell.alignment = { horizontal: "center", vertical: "middle" };
        levelCell.font = { bold: true, color: { argb: "FFFFFF" } };
        levelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: levelColors[index] },
        };

        const descCell = detailSheet.getCell(`B${row}`);
        descCell.value = item.desc;
        descCell.alignment = { vertical: "middle" };
        detailSheet.mergeCells(
          `B${row}:${String.fromCharCode(
            "A".charCodeAt(0) + headers.length - 1
          )}${row}`
        );
      });

      // 評価基準の説明
      const criteriaStartRow = legendRow + levelDesc.length + 3;
      detailSheet.mergeCells(
        `A${criteriaStartRow}:${String.fromCharCode(
          "A".charCodeAt(0) + headers.length - 1
        )}${criteriaStartRow}`
      );
      const criteriaHeaderCell = detailSheet.getCell(`A${criteriaStartRow}`);
      criteriaHeaderCell.value = "評価基準の説明";
      applyStyle(criteriaHeaderCell, STYLES.subtitle);

      // 各評価基準の説明
      activeCriteria.forEach((criteria, index) => {
        const row = criteriaStartRow + 2 + index;

        const nameCell = detailSheet.getCell(`A${row}`);
        nameCell.value = criteria.name;
        nameCell.font = { bold: true };

        const descCell = detailSheet.getCell(`B${row}`);
        descCell.value = criteria.description || "説明なし";
        detailSheet.mergeCells(
          `B${row}:${String.fromCharCode(
            "A".charCodeAt(0) + headers.length - 3
          )}${row}`
        );

        const rangeCell = detailSheet.getCell(
          `${String.fromCharCode("A".charCodeAt(0) + headers.length - 2)}${row}`
        );
        rangeCell.value = `${criteria.min_score}〜${criteria.max_score}`;
        rangeCell.alignment = { horizontal: "center" };

        const weightCell = detailSheet.getCell(
          `${String.fromCharCode("A".charCodeAt(0) + headers.length - 1)}${row}`
        );
        weightCell.value = `重み: ${criteria.weight.toFixed(1)}`;
        weightCell.alignment = { horizontal: "center" };
      });
    }

    // ========== 今後の傾向シート ==========
    if (data.futureTrend) {
      const trendSheet = workbook.addWorksheet("今後の傾向", {
        properties: { tabColor: { argb: COLORS.ACCENT2.hex } },
      });

      // カラム幅の設定
      trendSheet.columns = [
        { key: "A", width: 15 },
        { key: "B", width: 50 },
        { key: "C", width: 20 },
        { key: "D", width: 15 },
        { key: "E", width: 20 },
      ];

      // タイトル
      trendSheet.mergeCells("A1:E1");
      const trendTitleCell = trendSheet.getCell("A1");
      trendTitleCell.value = "今後の傾向予測";
      applyStyle(trendTitleCell, STYLES.title);
      trendSheet.getRow(1).height = 30;

      // サブタイトル
      trendSheet.mergeCells("A2:E2");
      const trendSubtitleCell = trendSheet.getCell("A2");
      trendSubtitleCell.value = "AIによる将来のスキル成長予測";
      trendSubtitleCell.font = { italic: true };
      trendSubtitleCell.alignment = { horizontal: "center" };

      // 傾向テキストをセクションに分割
      const sections = data.futureTrend.split(/【(.+?)】/g).filter(Boolean);
      let row = 4;

      for (let i = 0; i < sections.length; i += 2) {
        if (i + 1 < sections.length) {
          // セクションヘッダー
          const headerCell = trendSheet.getCell(`A${row}`);
          headerCell.value = `【${sections[i]}】`;
          headerCell.font = { bold: true, color: { argb: COLORS.PRIMARY.hex } };
          trendSheet.mergeCells(`A${row}:E${row}`);
          row++;

          // セクション内容
          const contentLines = sections[i + 1].trim().split("\n");
          contentLines.forEach((line: string) => {
            if (line.trim()) {
              const contentCell = trendSheet.getCell(`A${row}`);
              contentCell.value = line.trim();
              trendSheet.mergeCells(`A${row}:E${row}`);

              // 箇条書きは強調
              if (line.trim().startsWith("・")) {
                contentCell.font = { size: 11 };
                contentCell.alignment = { indent: 1 };
              }

              row++;
            }
          });

          // セクション間にスペースを入れる
          row++;
        }
      }

      // 予測度のビジュアル表現（仮想的な信頼度メーター）
      row += 2;
      trendSheet.mergeCells(`A${row}:E${row}`);
      const confidenceHeaderCell = trendSheet.getCell(`A${row}`);
      confidenceHeaderCell.value = "予測信頼度";
      applyStyle(confidenceHeaderCell, STYLES.subtitle);
      row++;

      // 信頼度バー描画（5段階）
      const confidenceLevel = 4; // 5段階中4（高い）と仮定

      for (let i = 1; i <= 5; i++) {
        const cell = trendSheet.getCell(
          `${String.fromCharCode("A".charCodeAt(0) + i - 1)}${row}`
        );
        cell.alignment = { horizontal: "center", vertical: "middle" };

        if (i <= confidenceLevel) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: COLORS.SECONDARY.hex },
          };
          cell.value = "■";
          cell.font = { color: { argb: COLORS.SECONDARY.hex }, size: 1 };
        } else {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "F2F2F2" },
          };
        }
      }

      // 信頼度ラベル
      trendSheet.mergeCells(`A${row + 1}:E${row + 1}`);
      const confidenceLevelCell = trendSheet.getCell(`A${row + 1}`);
      confidenceLevelCell.value = "高い信頼度 (十分なデータに基づく予測)";
      confidenceLevelCell.alignment = { horizontal: "center" };
      confidenceLevelCell.font = { italic: true };
    }

    // ========== AIインサイトシート ==========
    if (data.aiInsights) {
      const aiSheet = workbook.addWorksheet("AI分析", {
        properties: { tabColor: { argb: COLORS.ACCENT1.hex } },
      });

      // カラム幅の設定
      aiSheet.columns = [
        { key: "A", width: 15 },
        { key: "B", width: 50 },
        { key: "C", width: 20 },
        { key: "D", width: 15 },
        { key: "E", width: 20 },
      ];

      // タイトル
      aiSheet.mergeCells("A1:E1");
      const aiTitleCell = aiSheet.getCell("A1");
      aiTitleCell.value = "Claude 3.7 Sonnetによる分析と提案";
      applyStyle(aiTitleCell, STYLES.title);
      aiSheet.getRow(1).height = 30;

      // AIアイコン（仮想的に）
      aiSheet.mergeCells("A3:A8");
      const aiIconCell = aiSheet.getCell("A3");
      aiIconCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.ACCENT1.hex },
      };
      aiIconCell.value = "AI";
      aiIconCell.alignment = { horizontal: "center", vertical: "middle" };
      aiIconCell.font = { bold: true, size: 18, color: { argb: "FFFFFF" } };

      // 要約セクション
      aiSheet.mergeCells("B3:E3");
      const summaryHeaderCell = aiSheet.getCell("B3");
      summaryHeaderCell.value = "要約";
      applyStyle(summaryHeaderCell, STYLES.subtitle);

      aiSheet.mergeCells("B4:E7");
      const summaryCell = aiSheet.getCell("B4");
      summaryCell.value = data.aiInsights.summary || "データがありません";
      summaryCell.alignment = { wrapText: true, vertical: "top" };

      // 装飾ライン
      aiSheet.mergeCells("A9:E9");
      const decorLineCell = aiSheet.getCell("A9");
      decorLineCell.border = {
        bottom: { style: "thin", color: { argb: COLORS.ACCENT1.hex } },
      };

      let row = 10;

      // 主要な発見セクション
      row++;
      createSectionHeader(aiSheet, row, "主要な発見", 5);
      row++;

      if (
        data.aiInsights.keyFindings &&
        data.aiInsights.keyFindings.length > 0
      ) {
        data.aiInsights.keyFindings.forEach(
          (finding: string, index: number) => {
            aiSheet.mergeCells(`A${row}:E${row}`);
            const findingCell = aiSheet.getCell(`A${row}`);
            findingCell.value = `${index + 1}. ${finding}`;
            findingCell.alignment = { wrapText: true };
            row++;
          }
        );
      } else {
        aiSheet.mergeCells(`A${row}:E${row}`);
        const noDataCell = aiSheet.getCell(`A${row}`);
        noDataCell.value = "データがありません";
        row++;
      }

      // 推奨事項セクション
      row += 2;
      createSectionHeader(aiSheet, row, "推奨事項", 5);
      row++;

      if (
        data.aiInsights.recommendations &&
        data.aiInsights.recommendations.length > 0
      ) {
        data.aiInsights.recommendations.forEach(
          (recommendation: string, index: number) => {
            // 推奨事項をハイライトする特殊なセルデザイン
            aiSheet.mergeCells(`A${row}:E${row}`);
            const recCell = aiSheet.getCell(`A${row}`);
            recCell.value = `${index + 1}. ${recommendation}`;
            recCell.alignment = { wrapText: true };

            // 交互の色で見やすく
            if (index % 2 === 0) {
              recCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FDF2E9" }, // 薄いオレンジ
              };
            }

            row++;
          }
        );
      } else {
        aiSheet.mergeCells(`A${row}:E${row}`);
        const noRecCell = aiSheet.getCell(`A${row}`);
        noRecCell.value = "データがありません";
        row++;
      }

      // AIによる注釈
      row += 3;
      aiSheet.mergeCells(`A${row}:E${row}`);
      const aiNoteCell = aiSheet.getCell(`A${row}`);
      aiNoteCell.value =
        "※ この分析はデータに基づいてClaudeモデルによって自動生成されています。具体的なアクションを検討する際は、人間の判断を加えてください。";
      aiNoteCell.font = {
        italic: true,
        color: { argb: COLORS.ACCENT4.hex },
        size: 9,
      };
      aiNoteCell.alignment = { horizontal: "center" };
    }

    // ========== 評価基準シート ==========
    // このシートは動的な評価基準のドキュメントとして機能
    const criteriaSheet = workbook.addWorksheet("評価基準", {
      properties: { tabColor: { argb: "9C27B0" } }, // 紫
    });

    // カラム幅の設定
    criteriaSheet.columns = [
      { key: "key", width: 20 },
      { key: "name", width: 20 },
      { key: "description", width: 50 },
      { key: "min", width: 10 },
      { key: "max", width: 10 },
      { key: "weight", width: 10 },
      { key: "active", width: 10 },
      { key: "order", width: 10 },
    ];

    // タイトル
    criteriaSheet.mergeCells("A1:H1");
    const criteriaTitle = criteriaSheet.getCell("A1");
    criteriaTitle.value = "評価基準定義";
    applyStyle(criteriaTitle, STYLES.title);

    // テーブルヘッダー
    createTableHeader(criteriaSheet, 3, [
      "キー",
      "名前",
      "説明",
      "最小値",
      "最大値",
      "重み",
      "有効",
      "表示順",
    ]);

    // 評価基準データの出力
    activeCriteria.forEach((criteria, index) => {
      const row = index + 4;

      const cells = [
        { col: "A", value: criteria.key },
        { col: "B", value: criteria.name },
        { col: "C", value: criteria.description || "（説明なし）" },
        { col: "D", value: criteria.min_score },
        { col: "E", value: criteria.max_score },
        { col: "F", value: criteria.weight },
        { col: "G", value: criteria.is_active ? "はい" : "いいえ" },
        { col: "H", value: criteria.display_order },
      ];

      cells.forEach((cell) => {
        const tableCell = criteriaSheet.getCell(`${cell.col}${row}`);
        tableCell.value = cell.value;
        applyStyle(tableCell, STYLES.tableCell);

        // 特定のカラムのスタイル調整
        if (cell.col === "A") {
          tableCell.font = { bold: true, color: { argb: COLORS.PRIMARY.hex } };
        } else if (cell.col === "G") {
          // 有効/無効の色付け
          if (cell.value === "はい") {
            tableCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "E2EFDA" },
            }; // 緑
          } else {
            tableCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FCE4D6" },
            }; // 赤
          }
          tableCell.alignment = { horizontal: "center" };
        } else if (["D", "E", "F", "H"].includes(cell.col)) {
          // 数値カラムは右寄せ
          tableCell.alignment = { horizontal: "right" };
        }
      });
    });

    // 評価基準の説明
    const explanationRow = activeCriteria.length + 6;
    criteriaSheet.mergeCells(`A${explanationRow}:H${explanationRow}`);
    criteriaSheet.getCell(`A${explanationRow}`).value = "評価基準の説明";
    applyStyle(criteriaSheet.getCell(`A${explanationRow}`), STYLES.subtitle);

    // 説明テキスト
    const explanationText = [
      "このシートでは、システムで定義されている評価基準を一覧表示しています。各評価基準は以下の項目で構成されています：",
      "",
      "- キー: システム内での一意の識別子",
      "- 名前: 表示用の名称",
      "- 説明: 評価基準の詳細説明",
      "- 最小値/最大値: スコアの範囲",
      "- 重み: 総合スコア計算時の重み付け係数",
      "- 有効: 現在システムで使用されているかどうか",
      "- 表示順: 画面表示の順序",
      "",
      "新しい評価基準を追加したり、既存の基準を変更したりするには、システム管理者にお問い合わせください。",
      "評価基準は設定ファイル（evaluation-criteria.json）または管理画面から変更できます。",
    ];

    explanationText.forEach((line, idx) => {
      const lineRow = explanationRow + 2 + idx;
      criteriaSheet.mergeCells(`A${lineRow}:H${lineRow}`);
      criteriaSheet.getCell(`A${lineRow}`).value = line;
    });

    // フッター情報を各ワークシートに設定
    workbook.eachSheet((worksheet: Excel.Worksheet) => {
      // カスタムフッターの設定
      try {
        // @ts-ignore - ExcelJSの型定義がHeaderFooterを正しく認識していない
        worksheet.headerFooter = {
          oddFooter: `&L${new Date().toLocaleDateString("ja-JP")} &C${
            executor.name
          } &Rページ &P / &N`,
        };
      } catch (e) {
        console.warn("ヘッダー/フッター設定エラー:", e);
      }
    });

    // バッファとして返す
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  /**
   * 柔軟な評価基準に対応したPDFレポートを生成
   */
  private async generatePDFReport(data: any, executor: any): Promise<Buffer> {
    try {
      // 評価基準サービスのインスタンスを取得
      const criteriaService = EvaluationCriteriaService.getInstance();

      // PDFMake用のフォント定義
      let fonts;

      // デフォルトスタイルの設定（ここに移動）
      let defaultStyle: any = {
        fontSize: 10,
      };

      try {
        const fontPath = path.join(__dirname, "../assets/fonts/ipagp.ttf");
        // フォントファイルの存在を確認
        fs.accessSync(fontPath, fs.constants.R_OK);
        // 日本語フォントが利用可能な場合
        fonts = {
          IPAGothic: {
            normal: fontPath,
            bold: fontPath,
            italics: fontPath,
            bolditalics: fontPath,
          },
        };
        // フォントが使用可能な場合にデフォルトスタイルに追加
        defaultStyle.font = "IPAGothic";
        console.log("日本語フォントを使用します:", fontPath);
      } catch (error) {
        // フォントファイルが見つからない場合はデフォルトフォントを使用
        console.warn(
          "日本語フォントが見つかりません。デフォルトフォントを使用します:",
          (error as Error).message
        );
        fonts = {
          Roboto: {
            normal: "Helvetica",
            bold: "Helvetica-Bold",
            italics: "Helvetica-Oblique",
            bolditalics: "Helvetica-BoldOblique",
          },
        };
        // デフォルトフォントの場合はfontプロパティを指定しない
      }

      // PDFMakeのインスタンスを作成
      const printer = new PdfPrinter(fonts);

      // カラーパレットの定義（Excelレポートと統一）
      const COLORS = {
        PRIMARY: "#4472C4",
        SECONDARY: "#70AD47",
        ACCENT1: "#ED7D31",
        ACCENT2: "#FFC000",
        ACCENT3: "#5B9BD5",
        HEADER_BG: "#4472C4",
        HEADER_TEXT: "#FFFFFF",
        LEVEL_A: "#4CAF50",
        LEVEL_B: "#8BC34A",
        LEVEL_C: "#FFEB3B",
        LEVEL_D: "#FF9800",
        LEVEL_E: "#F44336",
      };

      // PDFMakeの型に適合したスタイル定義
      const styles: Record<string, any> = {
        header: {
          fontSize: 18,
          bold: true,
          alignment: "center" as const,
          margin: [0, 0, 0, 20],
        },
        subheader: {
          fontSize: 14,
          bold: true,
          margin: [0, 15, 0, 10],
          color: COLORS.PRIMARY,
        },
        sectionHeader: {
          fontSize: 12,
          bold: true,
          margin: [0, 10, 0, 5],
          color: COLORS.PRIMARY,
        },
        tableHeader: {
          fillColor: COLORS.HEADER_BG,
          color: COLORS.HEADER_TEXT,
          bold: true,
          alignment: "center" as const,
        },
        paragraph: {
          margin: [0, 5, 0, 10],
        },
        note: {
          fontSize: 8,
          italics: true,
          color: "#999999",
          margin: [0, 5, 0, 10],
        },
      };

      // 評価基準のマッピングを取得（動的に評価基準キーから表示名を取得）
      let criteriaMapping: Record<string, string> = {};
      try {
        criteriaMapping = await criteriaService.getCriteriaMapping();
      } catch (error) {
        console.warn("評価基準マッピングの取得に失敗しました:", error);
        // デフォルト値（エラー時の代替）
        criteriaMapping = {
          code_quality_score: "コード品質",
          readability_score: "可読性",
          efficiency_score: "効率性",
          best_practices_score: "ベストプラクティス",
        };
      }

      // 有効な評価基準のリストを取得
      let activeCriteria: any[] = [];
      try {
        activeCriteria = await criteriaService.getAllActiveCriteria();
      } catch (error) {
        console.warn("有効な評価基準の取得に失敗しました:", error);
        activeCriteria = [];
      }

      // スキルレベル分布テーブルの構築
      const skillDistTable = this.createSkillDistributionTable(data);

      // 成長推移テーブルの構築（存在する場合）
      let growthTrendTable = null;
      if (data.growthTrend && data.growthTrend.length > 0) {
        growthTrendTable = this.createGrowthTrendTable(data.growthTrend);
      }

      // 社員評価詳細テーブルの構築（存在する場合）
      let employeeDetailsTable = null;
      if (data.employeeEvaluations && data.employeeEvaluations.length > 0) {
        employeeDetailsTable = this.createEmployeeDetailsTable(
          data.employeeEvaluations,
          activeCriteria
        );
      }

      // AIインサイトテーブルの構築（存在する場合）
      let aiInsightsContent = null;
      if (data.aiInsights) {
        aiInsightsContent = this.createAIInsightsContent(data.aiInsights);
      }

      // PDFMakeの型定義に合わせた適切なドキュメントコンテンツ配列を構築
      const contentArray: any[] = [];

      // タイトル
      contentArray.push({
        text: "コードレビューツール 分析レポート",
        style: "header",
      });

      // 余白
      contentArray.push({
        text: "",
        margin: [0, 10, 0, 10],
      });

      // 基本情報テーブル
      contentArray.push({
        text: "基本情報",
        style: "subheader",
      });

      contentArray.push({
        table: {
          widths: [150, "*"],
          body: [
            ["出力日:", new Date().toLocaleDateString("ja-JP")],
            [
              "出力者:",
              `${executor.name} (${executor.department || "部署未設定"})`,
            ],
            [
              "対象期間:",
              data.period.startDate && data.period.endDate
                ? `${new Date(data.period.startDate).toLocaleDateString(
                    "ja-JP"
                  )} 〜 ${new Date(data.period.endDate).toLocaleDateString(
                    "ja-JP"
                  )}`
                : "全期間",
            ],
            ["新入社員数:", data.traineeCount.toString()],
            [
              "対象入社年度:",
              data.filterParams.joinYear
                ? data.filterParams.joinYear.toString()
                : "全年度",
            ],
            ["対象部署:", data.filterParams.department || "全部署"],
          ],
        },
        layout: "noBorders",
      });

      // 余白
      contentArray.push({
        text: "",
        margin: [0, 20, 0, 20],
      });

      // スキルレベル分布
      contentArray.push({
        text: "スキルレベル分布",
        style: "subheader",
      });

      contentArray.push(skillDistTable);

      // レベル説明
      contentArray.push({
        text: "レベル説明",
        style: "sectionHeader",
        margin: [0, 15, 0, 5],
      });

      contentArray.push({
        table: {
          widths: [40, "*"],
          body: [
            [
              { text: "レベルA", fillColor: COLORS.LEVEL_A },
              "卓越したスキルレベル。チームリーダーとして活躍できる能力を持つ。",
            ],
            [
              { text: "レベルB", fillColor: COLORS.LEVEL_B },
              "優れたスキルレベル。自立的に作業し、複雑な課題にも対応できる。",
            ],
            [
              { text: "レベルC", fillColor: COLORS.LEVEL_C },
              "良好なスキルレベル。基本的なタスクを自力で完了できる。",
            ],
            [
              { text: "レベルD", fillColor: COLORS.LEVEL_D },
              "改善が必要なスキルレベル。基本的な概念を理解しているが、実践力は限られている。",
            ],
            [
              { text: "レベルE", fillColor: COLORS.LEVEL_E },
              "基礎的なスキルレベル。継続的なサポートとガイダンスが必要。",
            ],
          ],
        },
        layout: {
          fillColor: function (
            rowIndex: number,
            node: any,
            columnIndex: number
          ) {
            return columnIndex === 0
              ? node.table.body[rowIndex][columnIndex].fillColor
              : null;
          },
        },
      });

      // 成長推移（あれば）
      if (growthTrendTable) {
        contentArray.push({
          text: "成長推移",
          style: "subheader",
          pageBreak: "before",
        });

        contentArray.push(growthTrendTable);

        contentArray.push({
          text: "※ 成長率は前期間比",
          style: "note",
        });
      }

      // 社員詳細（あれば）
      if (employeeDetailsTable) {
        contentArray.push({
          text: "社員詳細評価",
          style: "subheader",
          pageBreak: "before",
        });

        contentArray.push(employeeDetailsTable);

        // 評価基準の説明
        if (activeCriteria.length > 0) {
          contentArray.push({
            text: "評価基準の説明",
            style: "sectionHeader",
            margin: [0, 20, 0, 5],
          });

          const criteriaBodies = activeCriteria.map((c) => [
            c.name,
            c.description || "（説明なし）",
            `${c.min_score}〜${c.max_score}`,
            c.weight.toFixed(1),
          ]);

          contentArray.push({
            table: {
              headerRows: 1,
              widths: ["*", "*", 50, 50],
              body: [
                [
                  { text: "評価項目", style: "tableHeader" },
                  { text: "説明", style: "tableHeader" },
                  { text: "範囲", style: "tableHeader" },
                  { text: "重み", style: "tableHeader" },
                ],
                ...criteriaBodies,
              ],
            },
            layout: {
              fillColor: function (
                rowIndex: number,
                node: any,
                columnIndex: number
              ) {
                return rowIndex === 0 ? COLORS.HEADER_BG : null;
              },
            },
          });
        }
      }

      // 今後の傾向
      if (data.futureTrend) {
        contentArray.push({
          text: "今後の傾向予測",
          style: "subheader",
          pageBreak: "before",
        });

        // 傾向テキストをセクションに分割して整形
        const sections = data.futureTrend.split(/【(.+?)】/g).filter(Boolean);
        const trendContent = [];

        for (let i = 0; i < sections.length; i += 2) {
          if (i + 1 < sections.length) {
            // セクションヘッダー
            trendContent.push({
              text: `【${sections[i]}】`,
              bold: true,
              color: COLORS.PRIMARY,
              margin: [0, 10, 0, 5],
            });

            // セクション内容
            const contentLines = sections[i + 1].trim().split("\n");
            contentLines.forEach((line: string) => {
              if (line.trim()) {
                const contentObj = {
                  text: line.trim(),
                  margin: [0, 0, 0, 5],
                };

                // 箇条書きは強調
                if (line.trim().startsWith("・")) {
                  contentObj.margin = [10, 0, 0, 5];
                }

                trendContent.push(contentObj);
              }
            });
          }
        }

        contentArray.push({
          stack: trendContent,
        });
      }

      // AIインサイト（存在する場合）
      if (aiInsightsContent) {
        contentArray.push({
          text: "AI分析と提案",
          style: "subheader",
          pageBreak: "before",
        });

        contentArray.push({
          text: "以下はデータに基づくAIによる分析と提案です。",
          margin: [0, 0, 0, 10],
        });

        contentArray.push(aiInsightsContent);

        contentArray.push({
          text: "※ この分析はデータに基づいてClaudeモデルによって自動生成されています。具体的なアクションを検討する際は、人間の判断を加えてください。",
          style: "note",
          margin: [0, 20, 0, 0],
        });
      }

      // PDFドキュメントの定義
      const docDefinition = {
        info: {
          title: "コードレビューツール分析レポート",
          author: executor.name,
          subject: "新入社員評価分析",
          keywords: "コードレビュー, スキル評価, 成長分析",
          creator: "コードレビューツール",
          producer: "コードレビューツール",
        },
        content: contentArray,
        footer: function (currentPage: number, pageCount: number) {
          return {
            columns: [
              {
                text: new Date().toLocaleDateString("ja-JP"),
                alignment: "left" as const,
                margin: [40, 0, 0, 0] as [number, number, number, number],
              },
              {
                text: executor.name,
                alignment: "center" as const,
              },
              {
                text: currentPage.toString() + " / " + pageCount,
                alignment: "right" as const,
                margin: [0, 0, 40, 0] as [number, number, number, number],
              },
            ],
          } as ContentColumns;
        },
        defaultStyle: defaultStyle,
        styles: styles,
      };

      // PDFドキュメントを生成
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // PDFを非同期でバッファに変換
      return new Promise((resolve, reject) => {
        try {
          const chunks: Buffer[] = [];

          pdfDoc.on("data", (chunk) => {
            chunks.push(Buffer.from(chunk));
          });

          pdfDoc.on("end", () => {
            const result = Buffer.concat(chunks);
            resolve(result);
          });

          pdfDoc.on("error", (error) => {
            console.error("PDF生成エラー:", error);
            reject(error);
          });

          pdfDoc.end();
        } catch (error) {
          console.error("PDF生成処理エラー:", error);
          reject(error);
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("PDFレポート生成エラー:", error);
        throw new Error(`PDFレポートの生成に失敗しました: ${error.message}`);
      } else {
        console.error("PDFレポート生成エラー:", error);
        throw new Error(
          "PDFレポートの生成に失敗しました: 不明なエラーが発生しました"
        );
      }
    }
  }

  /**
   * スキルレベル分布テーブルを作成
   */
  private createSkillDistributionTable(data: any): any {
    // スキルレベル分布テーブルを作成
    const skillLevels = ["A", "B", "C", "D", "E"];
    const tableBody = [
      [
        { text: "レベル", style: "tableHeader" },
        { text: "人数", style: "tableHeader" },
        { text: "割合", style: "tableHeader" },
      ],
    ];

    skillLevels.forEach((level) => {
      const count =
        data.skillDistribution.find((d: any) => d.level === level)?.count || 0;
      const percentage =
        data.traineeCount > 0
          ? ((count / data.traineeCount) * 100).toFixed(1)
          : "0.0";

      tableBody.push([level, count.toString(), `${percentage}%`]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ["*", "*", "*"],
        body: tableBody,
      },
      layout: {
        fillColor: function (rowIndex: number, node: any, columnIndex: number) {
          return rowIndex === 0 ? "#4472C4" : null;
        },
        hLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? 2 : 1;
        },
        vLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? 2 : 1;
        },
        hLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length
            ? "#AAAAAA"
            : "#DDDDDD";
        },
        vLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length
            ? "#AAAAAA"
            : "#DDDDDD";
        },
      },
    };
  }

  /**
   * 成長推移テーブルを作成
   */
  private createGrowthTrendTable(growthTrend: any[]): any {
    const tableBody = [
      [
        { text: "期間", style: "tableHeader" },
        { text: "平均スキルレベル", style: "tableHeader" },
        { text: "成長率(%)", style: "tableHeader" },
      ],
    ];

    growthTrend.forEach((point) => {
      tableBody.push([
        point.period,
        point.averageLevel.toFixed(2),
        point.growthRate >= 0
          ? { text: `+${point.growthRate.toFixed(1)}%`, color: "#4CAF50" }
          : { text: `${point.growthRate.toFixed(1)}%`, color: "#F44336" },
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ["*", "*", "*"],
        body: tableBody,
      },
      layout: {
        fillColor: function (rowIndex: number, node: any, columnIndex: number) {
          return rowIndex === 0 ? "#4472C4" : null;
        },
        hLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? 2 : 1;
        },
        vLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? 2 : 1;
        },
        hLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length
            ? "#AAAAAA"
            : "#DDDDDD";
        },
        vLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length
            ? "#AAAAAA"
            : "#DDDDDD";
        },
      },
    };
  }

  /**
   * 社員詳細評価テーブルを作成
   */
  private createEmployeeDetailsTable(
    employeeEvaluations: any[],
    activeCriteria: any[]
  ): any {
    // 動的にヘッダー行を構築
    const headerRow = [
      { text: "ID", style: "tableHeader" },
      { text: "名前", style: "tableHeader" },
      { text: "部署", style: "tableHeader" },
      { text: "入社年度", style: "tableHeader" },
      { text: "スキルレベル", style: "tableHeader" },
    ];

    // 評価基準の列を追加
    activeCriteria.forEach((criteria) => {
      headerRow.push({ text: criteria.name, style: "tableHeader" });
    });

    // 総合スコア列を追加
    headerRow.push({ text: "総合スコア", style: "tableHeader" });

    // テーブルの列幅を設定
    const baseWidths = [30, "*", 60, 50, 40];
    const criteriaWidths = activeCriteria.map(() => 50);
    const totalScoreWidth = [50];
    const widths = [...baseWidths, ...criteriaWidths, ...totalScoreWidth];

    // テーブル本体を構築
    const tableBody = [headerRow];

    // スキルレベルに対応する色
    const levelColors = {
      A: "#4CAF50",
      B: "#8BC34A",
      C: "#FFEB3B",
      D: "#FF9800",
      E: "#F44336",
    };

    employeeEvaluations.forEach((employee) => {
      const row = [
        employee.id.toString(),
        employee.name,
        employee.department || "未設定",
        employee.join_year ? employee.join_year.toString() : "未設定",
      ];

      // スキルレベル（評価あり）または「評価なし」
      if (employee.evaluation) {
        const level = employee.evaluation.overall_level;
        row.push({
          text: level,
          fillColor:
            levelColors[level as keyof typeof levelColors] || "#CCCCCC",
        });

        // 各評価基準のスコアを追加
        let totalScoreSum = 0;
        let totalWeight = 0;

        activeCriteria.forEach((criteria) => {
          const scoreKey = `${criteria.key}_score`;
          const score = employee.evaluation[scoreKey];

          if (score !== undefined && score !== null) {
            row.push(score.toString());
            totalScoreSum += score * criteria.weight;
            totalWeight += criteria.weight;
          } else {
            row.push("-");
          }
        });

        // 総合スコアを計算（重み付け平均）
        const totalScore = totalWeight > 0 ? totalScoreSum / totalWeight : 0;
        row.push({
          text: totalScore.toFixed(1),
          bold: true,
        });
      } else {
        // 評価なしの場合
        row.push("評価なし");

        // 評価基準ごとに "-" を追加
        activeCriteria.forEach(() => {
          row.push("-");
        });

        // 総合スコアも "-"
        row.push("-");
      }

      tableBody.push(row);
    });

    return {
      table: {
        headerRows: 1,
        widths: widths,
        body: tableBody,
      },
      layout: {
        fillColor: function (rowIndex: number, node: any, columnIndex: number) {
          if (rowIndex === 0) {
            return "#4472C4"; // ヘッダー行の背景色
          }

          // スキルレベル列の背景色（4列目）
          if (columnIndex === 4 && rowIndex > 0) {
            const cellData = node.table.body[rowIndex][columnIndex];
            if (cellData && cellData.fillColor) {
              return cellData.fillColor;
            }
          }

          return null;
        },
        hLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length ? 2 : 1;
        },
        vLineWidth: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length ? 2 : 1;
        },
        hLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.body.length
            ? "#AAAAAA"
            : "#DDDDDD";
        },
        vLineColor: function (i: number, node: any) {
          return i === 0 || i === node.table.widths.length
            ? "#AAAAAA"
            : "#DDDDDD";
        },
      },
    };
  }

  /**
   * AI分析インサイトのコンテンツを作成
   */
  private createAIInsightsContent(aiInsights: any): any {
    const content = [];

    // 要約セクション
    content.push({
      text: "要約",
      style: "sectionHeader",
      margin: [0, 5, 0, 10],
    });

    content.push({
      text: aiInsights.summary || "AIによる分析を生成できませんでした。",
      margin: [0, 0, 0, 15],
    });

    // 主要な発見セクション
    content.push({
      text: "主要な発見",
      style: "sectionHeader",
      margin: [0, 5, 0, 10],
    });

    if (aiInsights.keyFindings && aiInsights.keyFindings.length > 0) {
      const findings = aiInsights.keyFindings.map(
        (finding: string, index: number) => ({
          text: `${index + 1}. ${finding}`,
          margin: [0, 0, 0, 5],
        })
      );

      content.push({
        stack: findings,
      });
    } else {
      content.push({
        text: "データがありません",
        margin: [0, 0, 0, 15],
      });
    }

    // 推奨事項セクション
    content.push({
      text: "推奨アクション",
      style: "sectionHeader",
      margin: [0, 15, 0, 10],
    });

    if (aiInsights.recommendations && aiInsights.recommendations.length > 0) {
      const recommendations = aiInsights.recommendations.map(
        (recommendation: string, index: number) => ({
          text: `${index + 1}. ${recommendation}`,
          margin: [0, 0, 0, 5],
        })
      );

      content.push({
        stack: recommendations,
      });
    } else {
      content.push({
        text: "データがありません",
        margin: [0, 0, 0, 15],
      });
    }

    return {
      stack: content,
    };
  }

  /**
   * Markdownレポートを生成
   */
  private async generateMarkdownReport(
    data: any,
    executor: any
  ): Promise<string> {
    // Markdownテキストの構築
    let markdown = `# コードレビューツール 分析レポート\n\n`;

    // 基本情報
    markdown += `## 基本情報\n\n`;
    markdown += `- **出力日**: ${new Date().toLocaleDateString("ja-JP")}\n`;
    markdown += `- **出力者**: ${executor.name} (${
      executor.department || "部署未設定"
    })\n`;
    markdown += `- **対象期間**: ${
      data.period.startDate && data.period.endDate
        ? `${new Date(data.period.startDate).toLocaleDateString(
            "ja-JP"
          )} 〜 ${new Date(data.period.endDate).toLocaleDateString("ja-JP")}`
        : "全期間"
    }\n`;
    markdown += `- **新入社員数**: ${data.traineeCount}名\n`;
    markdown += `- **対象入社年度**: ${
      data.filterParams.joinYear ? data.filterParams.joinYear : "全年度"
    }\n`;
    markdown += `- **対象部署**: ${
      data.filterParams.department || "全部署"
    }\n\n`;

    // スキルレベル分布
    markdown += `## スキルレベル分布\n\n`;
    markdown += `| レベル | 人数 | 割合 |\n`;
    markdown += `| ------ | ---- | ---- |\n`;

    ["A", "B", "C", "D", "E"].forEach((level) => {
      const count =
        data.skillDistribution.find((d: any) => d.level === level)?.count || 0;
      const percentage =
        data.traineeCount > 0
          ? ((count / data.traineeCount) * 100).toFixed(1)
          : "0.0";
      markdown += `| ${level} | ${count} | ${percentage}% |\n`;
    });
    markdown += `\n`;

    // 成長推移
    if (data.growthTrend && data.growthTrend.length > 0) {
      markdown += `## 成長推移\n\n`;
      markdown += `| 期間 | 平均スキルレベル | 成長率(%) |\n`;
      markdown += `| ---- | ---------------- | --------- |\n`;

      data.growthTrend.forEach((point: any) => {
        markdown += `| ${point.period} | ${point.averageLevel.toFixed(2)} | ${
          point.growthRate
        }% |\n`;
      });
      markdown += `\n_※ 成長率は前期間比_\n\n`;

      // グラフ表現（ASCII Art的な表現）
      markdown += `### 成長推移（視覚的表現）\n\n`;
      markdown += `\`\`\`\n`;
      markdown += `スキルレベル\n`;
      markdown += `   ^   \n`;

      // 最大値と最小値を取得
      const max = Math.max(...data.growthTrend.map((p: any) => p.averageLevel));
      const min = Math.min(...data.growthTrend.map((p: any) => p.averageLevel));
      const range = max - min;
      const height = 10; // グラフの高さ

      // グラフの上部から描画していく
      for (let i = height; i >= 0; i--) {
        const value = max - (range * i) / height;
        const label = i % 5 === 0 ? value.toFixed(1).padStart(4, " ") : "    ";
        markdown += `${label} |`;

        // 各ポイントを描画
        data.growthTrend.forEach((point: any, idx: number) => {
          if (
            point.averageLevel >= value - range / (2 * height) &&
            point.averageLevel < value + range / (2 * height)
          ) {
            markdown += `o`;
          } else if (
            idx > 0 &&
            data.growthTrend[idx - 1].averageLevel < value &&
            point.averageLevel >= value
          ) {
            markdown += `/`;
          } else if (
            idx > 0 &&
            data.growthTrend[idx - 1].averageLevel >= value &&
            point.averageLevel < value
          ) {
            markdown += `\\`;
          } else {
            markdown += ` `;
          }
          markdown += `       `;
        });
        markdown += `\n`;
      }

      markdown += `      +`;
      data.growthTrend.forEach(() => {
        markdown += `--------`;
      });
      markdown += `> 期間\n`;
      markdown += `        `;
      data.growthTrend.forEach((point: any) => {
        markdown += `${point.period.padEnd(8, " ")}`;
      });
      markdown += `\n\`\`\`\n\n`;
    }

    // 社員詳細評価
    if (data.employeeEvaluations && data.employeeEvaluations.length > 0) {
      markdown += `## 社員詳細評価\n\n`;
      markdown += `| ID | 名前 | 部署 | 入社年度 | スキルレベル | 総合スコア |\n`;
      markdown += `| -- | ---- | ---- | -------- | ------------ | ---------- |\n`;

      data.employeeEvaluations.forEach((emp: any) => {
        let totalScore = "-";
        if (emp.evaluation) {
          totalScore = (
            (emp.evaluation.code_quality_score +
              emp.evaluation.readability_score +
              emp.evaluation.efficiency_score +
              emp.evaluation.best_practices_score) /
            4
          ).toFixed(1);
        }

        markdown += `| ${emp.id} | ${emp.name} | ${
          emp.department || "未設定"
        } | ${emp.join_year || "未設定"} | ${
          emp.evaluation ? emp.evaluation.overall_level : "評価なし"
        } | ${totalScore} |\n`;
      });
      markdown += `\n`;
    }

    // 今後の傾向
    if (data.futureTrend) {
      markdown += `## 今後の傾向予測\n\n`;
      markdown += `${data.futureTrend.replace(/\n/g, "\n\n")}\n\n`;
    }

    // AIインサイト
    if (data.aiInsights) {
      markdown += `## AIによる分析と提案\n\n`;

      markdown += `### 要約\n\n`;
      markdown += `${data.aiInsights.summary || "データがありません"}\n\n`;

      markdown += `### 主要な発見\n\n`;
      if (
        data.aiInsights.keyFindings &&
        data.aiInsights.keyFindings.length > 0
      ) {
        data.aiInsights.keyFindings.forEach(
          (finding: string, index: number) => {
            markdown += `${index + 1}. ${finding}\n`;
          }
        );
      } else {
        markdown += `データがありません\n`;
      }
      markdown += `\n`;

      markdown += `### 推奨事項\n\n`;
      if (
        data.aiInsights.recommendations &&
        data.aiInsights.recommendations.length > 0
      ) {
        data.aiInsights.recommendations.forEach(
          (recommendation: string, index: number) => {
            markdown += `${index + 1}. ${recommendation}\n`;
          }
        );
      } else {
        markdown += `データがありません\n`;
      }
      markdown += `\n`;
    }

    // フッター
    markdown += `---\n\n`;
    markdown += `*このレポートは${
      executor.name
    }によって${new Date().toLocaleDateString("ja-JP")}に生成されました*\n`;

    return markdown;
  }

  /**
   * グラフィックレポートを生成（SVG形式）
   */
  private async generateGraphicReport(
    data: any,
    executor: any
  ): Promise<string> {
    // SVGの基本構造を作成
    let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <style>
    @font-face {
      font-family: 'IPAGothic';
      src: url('data:application/font-woff;charset=utf-8;base64,...') format('woff');
      font-weight: normal;
      font-style: normal;
    }
    text {
      font-family: 'IPAGothic', sans-serif;
    }
    .title {
      font-size: 32px;
      font-weight: bold;
      text-anchor: middle;
    }
    .subtitle {
      font-size: 20px;
      font-weight: bold;
    }
    .label {
      font-size: 14px;
    }
    .value {
      font-size: 16px;
      font-weight: bold;
    }
    .small {
      font-size: 12px;
    }
    .bar-A { fill: #4caf50; }
    .bar-B { fill: #8bc34a; }
    .bar-C { fill: #ffeb3b; }
    .bar-D { fill: #ff9800; }
    .bar-E { fill: #f44336; }
    .section {
      fill: #f9f9f9;
      stroke: #e0e0e0;
      stroke-width: 1;
    }
  </style>

  <!-- 背景 -->
  <rect width="1200" height="1600" fill="white"/>

  <!-- ヘッダー -->
  <rect x="0" y="0" width="1200" height="100" fill="#f0f0f0"/>
  <text x="600" y="60" class="title">コードレビューツール 分析レポート</text>

  <!-- 基本情報セクション -->
  <rect x="50" y="120" width="1100" height="180" class="section" rx="10"/>
  <text x="70" y="150" class="subtitle">基本情報</text>
  
  <text x="100" y="180" class="label">出力日:</text>
  <text x="250" y="180" class="value">${new Date().toLocaleDateString(
    "ja-JP"
  )}</text>
  
  <text x="100" y="210" class="label">出力者:</text>
  <text x="250" y="210" class="value">${executor.name} (${
      executor.department || "部署未設定"
    })</text>
  
  <text x="100" y="240" class="label">対象期間:</text>
  <text x="250" y="240" class="value">${
    data.period.startDate && data.period.endDate
      ? `${new Date(data.period.startDate).toLocaleDateString(
          "ja-JP"
        )} 〜 ${new Date(data.period.endDate).toLocaleDateString("ja-JP")}`
      : "全期間"
  }</text>
  
  <text x="500" y="180" class="label">新入社員数:</text>
  <text x="650" y="180" class="value">${data.traineeCount}名</text>
  
  <text x="500" y="210" class="label">対象入社年度:</text>
  <text x="650" y="210" class="value">${
    data.filterParams.joinYear ? data.filterParams.joinYear : "全年度"
  }</text>
  
  <text x="500" y="240" class="label">対象部署:</text>
  <text x="650" y="240" class="value">${
    data.filterParams.department || "全部署"
  }</text>

  <!-- スキルレベル分布セクション -->
  <rect x="50" y="320" width="500" height="400" class="section" rx="10"/>
  <text x="70" y="350" class="subtitle">スキルレベル分布</text>`;

    // スキルレベル分布の棒グラフを生成
    const levels = ["A", "B", "C", "D", "E"];
    const barWidth = 60;
    const barSpacing = 40;
    const barMaxHeight = 300;
    const barStartX = 150;
    const barStartY = 650;

    // 最大値を取得
    let maxCount = 0;
    levels.forEach((level) => {
      const count =
        data.skillDistribution.find((d: any) => d.level === level)?.count || 0;
      if (count > maxCount) maxCount = count;
    });

    // Y軸スケールを描画
    svg += `
  <!-- Y軸 -->
  <line x1="${barStartX - 20}" y1="${barStartY}" x2="${barStartX - 20}" y2="${
      barStartY - barMaxHeight
    }" stroke="black" stroke-width="1"/>`;

    // Y軸の目盛りとラベルを描画
    const yTickCount = 5;
    for (let i = 0; i <= yTickCount; i++) {
      const y = barStartY - (i * barMaxHeight) / yTickCount;
      const value = ((i * maxCount) / yTickCount).toFixed(0);
      svg += `
  <line x1="${barStartX - 20}" y1="${y}" x2="${
        barStartX - 25
      }" y2="${y}" stroke="black" stroke-width="1"/>
  <text x="${barStartX - 30}" y="${
        y + 5
      }" class="small" text-anchor="end">${value}</text>`;
    }

    // X軸を描画
    svg += `
  <!-- X軸 -->
  <line x1="${barStartX - 20}" y1="${barStartY}" x2="${
      barStartX + levels.length * (barWidth + barSpacing)
    }" y2="${barStartY}" stroke="black" stroke-width="1"/>`;

    // 棒グラフとラベルを描画
    levels.forEach((level, index) => {
      const count =
        data.skillDistribution.find((d: any) => d.level === level)?.count || 0;
      const percentage =
        data.traineeCount > 0
          ? ((count / data.traineeCount) * 100).toFixed(1)
          : "0.0";
      const barHeight = (count / maxCount) * barMaxHeight || 0;
      const barX = barStartX + index * (barWidth + barSpacing);
      const barY = barStartY - barHeight;

      svg += `
  <!-- ${level}レベルの棒 -->
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" class="bar-${level}"/>
  <text x="${barX + barWidth / 2}" y="${
        barStartY + 20
      }" class="label" text-anchor="middle">${level}</text>
  <text x="${barX + barWidth / 2}" y="${
        barY - 10
      }" class="small" text-anchor="middle">${count}名 (${percentage}%)</text>`;
    });

    // 成長推移セクション（あれば）
    if (data.growthTrend && data.growthTrend.length > 0) {
      svg += `
  <!-- 成長推移セクション -->
  <rect x="600" y="320" width="550" height="400" class="section" rx="10"/>
  <text x="620" y="350" class="subtitle">成長推移</text>`;

      // 折れ線グラフの設定
      const lineGraphWidth = 450;
      const lineGraphHeight = 300;
      const lineGraphStartX = 650;
      const lineGraphStartY = 650;
      const pointCount = data.growthTrend.length;
      const pointSpacing = lineGraphWidth / (pointCount - 1);

      // 最大値と最小値を取得
      const values = data.growthTrend.map((p: any) => p.averageLevel);
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);
      const valueRange = maxValue - minValue || 1;

      // Y軸スケールを描画
      svg += `
  <!-- Y軸 (成長推移) -->
  <line x1="${lineGraphStartX - 20}" y1="${lineGraphStartY}" x2="${
        lineGraphStartX - 20
      }" y2="${
        lineGraphStartY - lineGraphHeight
      }" stroke="black" stroke-width="1"/>`;

      // Y軸の目盛りとラベルを描画
      const lineYTickCount = 5;
      for (let i = 0; i <= lineYTickCount; i++) {
        const y = lineGraphStartY - (i * lineGraphHeight) / lineYTickCount;
        const value = (minValue + (i * valueRange) / lineYTickCount).toFixed(1);
        svg += `
  <line x1="${lineGraphStartX - 20}" y1="${y}" x2="${
          lineGraphStartX - 25
        }" y2="${y}" stroke="black" stroke-width="1"/>
  <text x="${lineGraphStartX - 30}" y="${
          y + 5
        }" class="small" text-anchor="end">${value}</text>`;
      }

      // X軸を描画
      svg += `
  <!-- X軸 (成長推移) -->
  <line x1="${lineGraphStartX - 20}" y1="${lineGraphStartY}" x2="${
        lineGraphStartX + lineGraphWidth
      }" y2="${lineGraphStartY}" stroke="black" stroke-width="1"/>`;

      // 折れ線グラフのポイントとラインを描画
      let pathData = "";
      data.growthTrend.forEach((point: any, index: number) => {
        const x = lineGraphStartX + index * pointSpacing;
        const normalizedValue = (point.averageLevel - minValue) / valueRange;
        const y = lineGraphStartY - normalizedValue * lineGraphHeight;

        if (index === 0) {
          pathData = `M ${x} ${y}`;
        } else {
          pathData += ` L ${x} ${y}`;
        }

        // ポイントを描画
        svg += `
  <circle cx="${x}" cy="${y}" r="4" fill="#4285f4"/>
  <text x="${x}" y="${
          lineGraphStartY + 20
        }" class="small" text-anchor="middle">${point.period}</text>`;
      });

      // パスを描画
      svg += `
  <path d="${pathData}" fill="none" stroke="#4285f4" stroke-width="2"/>`;
    }

    // 今後の傾向セクション（あれば）
    if (data.futureTrend) {
      svg += `
  <!-- 今後の傾向セクション -->
  <rect x="50" y="740" width="1100" height="300" class="section" rx="10"/>
  <text x="70" y="770" class="subtitle">今後の傾向予測</text>`;

      // テキストを行に分割して描画
      const lineHeight = 20;
      const lines = data.futureTrend.split("\n");
      let yPos = 800;

      lines.forEach((line: string) => {
        if (line.trim() === "") {
          yPos += lineHeight / 2;
          return;
        }

        // 見出し風の行は太字で
        if (line.startsWith("【") && line.includes("】")) {
          svg += `
  <text x="70" y="${yPos}" class="subtitle" font-size="16">${line}</text>`;
        } else {
          svg += `
  <text x="70" y="${yPos}" class="small">${line}</text>`;
        }

        yPos += lineHeight;
      });
    }

    // AIインサイトセクション（あれば）
    if (data.aiInsights) {
      svg += `
  <!-- AIインサイトセクション -->
  <rect x="50" y="1060" width="1100" height="400" class="section" rx="10"/>
  <text x="70" y="1090" class="subtitle">AIによる分析と提案</text>`;

      let yPos = 1120;

      // 要約
      svg += `
  <text x="70" y="${yPos}" class="subtitle" font-size="16">要約</text>`;
      yPos += 30;

      // 要約テキストの表示（行に分割）
      const summaryLines = data.aiInsights.summary
        ? data.aiInsights.summary.split(/(.{60})/).filter(Boolean)
        : ["データがありません"];
      summaryLines.forEach((line: string) => {
        svg += `
  <text x="70" y="${yPos}" class="small">${line}</text>`;
        yPos += 20;
      });

      yPos += 20;

      // 主要な発見
      svg += `
  <text x="70" y="${yPos}" class="subtitle" font-size="16">主要な発見</text>`;
      yPos += 30;

      if (
        data.aiInsights.keyFindings &&
        data.aiInsights.keyFindings.length > 0
      ) {
        data.aiInsights.keyFindings.forEach(
          (finding: string, index: number) => {
            const findingLines = finding.split(/(.{60})/).filter(Boolean);
            svg += `
  <text x="70" y="${yPos}" class="small">・ ${findingLines[0]}</text>`;
            yPos += 20;

            for (let i = 1; i < findingLines.length; i++) {
              svg += `
  <text x="90" y="${yPos}" class="small">${findingLines[i]}</text>`;
              yPos += 20;
            }
          }
        );
      } else {
        svg += `
  <text x="70" y="${yPos}" class="small">データがありません</text>`;
        yPos += 20;
      }

      yPos += 20;

      // 推奨事項（あれば）
      if (yPos < 1400) {
        svg += `
  <text x="70" y="${yPos}" class="subtitle" font-size="16">推奨事項</text>`;
        yPos += 30;

        if (
          data.aiInsights.recommendations &&
          data.aiInsights.recommendations.length > 0
        ) {
          data.aiInsights.recommendations.forEach(
            (recommendation: string, index: number) => {
              const recLines = recommendation.split(/(.{60})/).filter(Boolean);
              svg += `
  <text x="70" y="${yPos}" class="small">・ ${recLines[0]}</text>`;
              yPos += 20;

              for (let i = 1; i < recLines.length; i++) {
                svg += `
  <text x="90" y="${yPos}" class="small">${recLines[i]}</text>`;
                yPos += 20;
              }
            }
          );
        } else {
          svg += `
  <text x="70" y="${yPos}" class="small">データがありません</text>`;
        }
      }
    }

    // フッター
    svg += `
  <!-- フッター -->
  <rect x="0" y="1500" width="1200" height="100" fill="#f0f0f0"/>
  <text x="100" y="1540" class="small">このレポートは${
    executor.name
  }によって${new Date().toLocaleDateString("ja-JP")}に生成されました</text>
  <text x="900" y="1540" class="small">コードレビューツール</text>
</svg>`;

    return svg;
  }
}
