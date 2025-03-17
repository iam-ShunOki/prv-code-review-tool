// backend/src/controllers/AnalyticsExportController.ts
import { Request, Response } from "express";
import { AnalyticsService } from "../services/AnalyticsService";
import { UserService } from "../services/UserService";
import { EvaluationService } from "../services/EvaluationService";
import Excel from "exceljs";
import { z } from "zod";
import PdfPrinter from "pdfmake";
import * as fs from "fs";
import * as path from "path";
import { TDocumentDefinitions, ContentColumns } from "pdfmake/interfaces";

export class AnalyticsExportController {
  private analyticsService: AnalyticsService;
  private userService: UserService;
  private evaluationService: EvaluationService;

  constructor() {
    this.analyticsService = new AnalyticsService();
    this.userService = new UserService();
    this.evaluationService = new EvaluationService();
  }

  /**
   * レポートをエクスポートする
   */
  exportReport = async (req: Request, res: Response): Promise<void> => {
    try {
      // パラメータのバリデーション
      const exportSchema = z.object({
        format: z.enum(["excel", "pdf"]),
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
        includePrediction
      );

      // 出力形式に応じてレポートを生成して返す
      if (format === "excel") {
        const buffer = await this.generateExcelReport(reportData, executor);

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
        res.send(buffer);
      } else {
        const pdfDoc = await this.generatePDFReport(reportData, executor);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="analytics_report_${
            new Date().toISOString().split("T")[0]
          }.pdf"`
        );
        res.send(pdfDoc);
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
    includePrediction: boolean = true
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
      generatedAt: new Date(),
      filterParams: {
        joinYear,
        department,
      },
    };
  }

  /**
   * Excelレポートを生成
   */
  /**
   * Excelレポートを生成
   */
  private async generateExcelReport(data: any, executor: any): Promise<Buffer> {
    const workbook = new Excel.Workbook();

    // サマリーシート
    const summarySheet = workbook.addWorksheet("サマリー");

    // ヘッダー
    summarySheet.mergeCells("A1:F1");
    summarySheet.getCell("A1").value = "コードレビューツール 分析レポート";
    summarySheet.getCell("A1").font = { size: 16, bold: true };
    summarySheet.getCell("A1").alignment = { horizontal: "center" };

    // レポート基本情報
    summarySheet.getCell("A3").value = "出力日:";
    summarySheet.getCell("B3").value = new Date().toLocaleDateString("ja-JP");

    summarySheet.getCell("A4").value = "出力者:";
    summarySheet.getCell("B4").value = `${executor.name} (${
      executor.department || "部署未設定"
    })`;

    summarySheet.getCell("A5").value = "対象期間:";
    if (data.period.startDate && data.period.endDate) {
      summarySheet.getCell("B5").value = `${new Date(
        data.period.startDate
      ).toLocaleDateString("ja-JP")} 〜 ${new Date(
        data.period.endDate
      ).toLocaleDateString("ja-JP")}`;
    } else {
      summarySheet.getCell("B5").value = "全期間";
    }

    summarySheet.getCell("A6").value = "新入社員数:";
    summarySheet.getCell("B6").value = data.traineeCount;

    summarySheet.getCell("A7").value = "対象入社年度:";
    summarySheet.getCell("B7").value = data.filterParams.joinYear || "全年度";

    summarySheet.getCell("A8").value = "対象部署:";
    summarySheet.getCell("B8").value = data.filterParams.department || "全部署";

    // スキルレベル分布
    summarySheet.mergeCells("A10:F10");
    summarySheet.getCell("A10").value = "スキルレベル分布";
    summarySheet.getCell("A10").font = { size: 14, bold: true };

    summarySheet.getCell("A11").value = "レベル";
    summarySheet.getCell("B11").value = "人数";
    summarySheet.getCell("C11").value = "割合";

    const skillLevels = ["A", "B", "C", "D", "E"];
    skillLevels.forEach((level, index) => {
      const count =
        data.skillDistribution.find((d: any) => d.level === level)?.count || 0;
      const percentage =
        data.traineeCount > 0
          ? ((count / data.traineeCount) * 100).toFixed(1)
          : "0.0";

      summarySheet.getCell(`A${12 + index}`).value = level;
      summarySheet.getCell(`B${12 + index}`).value = count;
      summarySheet.getCell(`C${12 + index}`).value = `${percentage}%`;
    });

    // スタイル設定
    ["A3:A8", "A11:C11"].forEach((range) => {
      summarySheet.getCell(range).font = { bold: true };
    });

    // 成長推移データを追加
    if (data.growthTrend && data.growthTrend.length > 0) {
      const growthSheet = workbook.addWorksheet("成長推移");

      growthSheet.getCell("A1").value = "期間";
      growthSheet.getCell("B1").value = "平均スキルレベル";
      growthSheet.getCell("C1").value = "成長率(%)";

      growthSheet.getRow(1).font = { bold: true };

      data.growthTrend.forEach((point: any, index: number) => {
        const rowIndex = index + 2;
        growthSheet.getCell(`A${rowIndex}`).value = point.period;
        growthSheet.getCell(`B${rowIndex}`).value =
          point.averageLevel.toFixed(2);
        growthSheet.getCell(`C${rowIndex}`).value = `${point.growthRate}%`;
      });

      // グラフ作成のためのコメント (ExcelJSのchartモジュールは省略)
      growthSheet.getCell("E1").value =
        "※ ここにグラフが表示されます（Excelで開いて編集してください）";
      growthSheet.getCell("E1").font = {
        italic: true,
        color: { argb: "666666" },
      };
    }

    // 社員ごとの詳細シート
    if (data.employeeEvaluations && data.employeeEvaluations.length > 0) {
      const detailSheet = workbook.addWorksheet("社員詳細");

      detailSheet.getCell("A1").value = "ID";
      detailSheet.getCell("B1").value = "名前";
      detailSheet.getCell("C1").value = "部署";
      detailSheet.getCell("D1").value = "入社年度";
      detailSheet.getCell("E1").value = "スキルレベル";
      detailSheet.getCell("F1").value = "コード品質スコア";
      detailSheet.getCell("G1").value = "可読性スコア";
      detailSheet.getCell("H1").value = "効率性スコア";
      detailSheet.getCell("I1").value = "ベストプラクティススコア";
      detailSheet.getCell("J1").value = "総合スコア";

      // スタイル設定
      detailSheet.getRow(1).font = { bold: true };
      detailSheet.columns = [
        { key: "id", width: 10 },
        { key: "name", width: 20 },
        { key: "department", width: 20 },
        { key: "joinYear", width: 15 },
        { key: "level", width: 15 },
        { key: "codeQuality", width: 15 },
        { key: "readability", width: 15 },
        { key: "efficiency", width: 15 },
        { key: "bestPractices", width: 15 },
        { key: "totalScore", width: 15 },
      ];

      // データ入力
      data.employeeEvaluations.forEach((employee: any, index: number) => {
        const rowIndex = index + 2;
        detailSheet.getCell(`A${rowIndex}`).value = employee.id;
        detailSheet.getCell(`B${rowIndex}`).value = employee.name;
        detailSheet.getCell(`C${rowIndex}`).value =
          employee.department || "未設定";
        detailSheet.getCell(`D${rowIndex}`).value =
          employee.join_year || "未設定";

        if (employee.evaluation) {
          detailSheet.getCell(`E${rowIndex}`).value =
            employee.evaluation.overall_level;
          detailSheet.getCell(`F${rowIndex}`).value =
            employee.evaluation.code_quality_score;
          detailSheet.getCell(`G${rowIndex}`).value =
            employee.evaluation.readability_score;
          detailSheet.getCell(`H${rowIndex}`).value =
            employee.evaluation.efficiency_score;
          detailSheet.getCell(`I${rowIndex}`).value =
            employee.evaluation.best_practices_score;

          // 総合スコアを計算
          const totalScore =
            (employee.evaluation.code_quality_score +
              employee.evaluation.readability_score +
              employee.evaluation.efficiency_score +
              employee.evaluation.best_practices_score) /
            4;

          detailSheet.getCell(`J${rowIndex}`).value = totalScore.toFixed(1);

          // スキルレベルに応じたセル色設定
          const levelCell = detailSheet.getCell(`E${rowIndex}`);
          const levelColorMap: { [key: string]: string } = {
            A: "C6EFCE", // 薄緑
            B: "B7DEE8", // 薄青
            C: "FFEB9C", // 薄黄
            D: "FFC7CE", // 薄赤
            E: "F2F2F2", // 薄灰
          };

          levelCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb:
                levelColorMap[employee.evaluation.overall_level] || "FFFFFF",
            },
          };
        } else {
          detailSheet.getCell(`E${rowIndex}`).value = "評価なし";
          detailSheet.getCell(`F${rowIndex}`).value = "-";
          detailSheet.getCell(`G${rowIndex}`).value = "-";
          detailSheet.getCell(`H${rowIndex}`).value = "-";
          detailSheet.getCell(`I${rowIndex}`).value = "-";
          detailSheet.getCell(`J${rowIndex}`).value = "-";
        }
      });
    }

    // 今後の傾向シート
    if (data.futureTrend) {
      const trendSheet = workbook.addWorksheet("今後の傾向");

      trendSheet.mergeCells("A1:E1");
      trendSheet.getCell("A1").value = "今後の傾向予測";
      trendSheet.getCell("A1").font = { size: 14, bold: true };

      trendSheet.getCell("A3").value = data.futureTrend || "データがありません";
      trendSheet.getCell("A3").alignment = { wrapText: true };
    }

    // フッター情報を各ワークシートに設定
    workbook.eachSheet((worksheet: { headerFooter: any }) => {
      // ExcelJSのヘッダー/フッターAPIの制限を回避するため、代替方法を使用
      try {
        if (worksheet && worksheet.headerFooter) {
          // nullチェックと型ガードを追加
          (
            worksheet.headerFooter as any
          ).oddFooter = `&L${new Date().toLocaleDateString()} &C${
            executor.name
          } &Rページ &P / &N`;
        }
      } catch (e) {
        console.warn("ヘッダー/フッター設定エラー:", e);
      }
    });

    // バッファとして返す
    return (await workbook.xlsx.writeBuffer()) as Buffer;
  }

  /**
   * PDFレポートを生成
   */
  private async generatePDFReport(data: any, executor: any): Promise<Buffer> {
    // PDFMake用のフォント定義
    const fonts = {
      IPAGothic: {
        normal: path.join(__dirname, "../assets/fonts/ipagp.ttf"),
        bold: path.join(__dirname, "../assets/fonts/ipagp.ttf"),
        italics: path.join(__dirname, "../assets/fonts/ipagp.ttf"),
        bolditalics: path.join(__dirname, "../assets/fonts/ipagp.ttf"),
      },
    };

    // PDFMakeのインスタンスを作成
    const printer = new PdfPrinter(fonts);

    // スキルレベル分布テーブルを作成
    const skillDistTable = {
      table: {
        headerRows: 1,
        widths: ["*", "*", "*"],
        body: [
          ["レベル", "人数", "割合"],
          ...["A", "B", "C", "D", "E"].map((level) => {
            const count =
              data.skillDistribution.find((d: any) => d.level === level)
                ?.count || 0;
            const percentage =
              data.traineeCount > 0
                ? ((count / data.traineeCount) * 100).toFixed(1)
                : "0.0";
            return [level, count.toString(), `${percentage}%`];
          }),
        ],
      },
    };

    // 社員評価詳細テーブルを作成
    let employeeDetailsTable = null;
    if (data.employeeEvaluations && data.employeeEvaluations.length > 0) {
      employeeDetailsTable = {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto", "auto", "auto", "auto"],
          body: [
            ["ID", "名前", "部署", "入社年度", "スキルレベル", "総合スコア"],
            ...data.employeeEvaluations.map((emp: any) => {
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

              return [
                emp.id.toString(),
                emp.name,
                emp.department || "未設定",
                emp.join_year ? emp.join_year.toString() : "未設定",
                emp.evaluation ? emp.evaluation.overall_level : "評価なし",
                totalScore,
              ];
            }),
          ],
        },
      };
    }

    // 成長推移テーブルを作成
    let growthTrendTable = null;
    if (data.growthTrend && data.growthTrend.length > 0) {
      growthTrendTable = {
        table: {
          headerRows: 1,
          widths: ["*", "*", "*"],
          body: [
            ["期間", "平均スキルレベル", "成長率(%)"],
            ...data.growthTrend.map((point: any) => [
              point.period,
              point.averageLevel.toFixed(2),
              `${point.growthRate}%`,
            ]),
          ],
        },
      };
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
      margin: 10,
    });

    // 基本情報テーブル
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
      margin: 20,
    });

    // スキルレベル分布
    contentArray.push({
      text: "スキルレベル分布",
      style: "subheader",
    });

    contentArray.push(skillDistTable);

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
    }

    // 今後の傾向
    if (data.futureTrend) {
      contentArray.push({
        text: "今後の傾向予測",
        style: "subheader",
        pageBreak: "before",
      });

      contentArray.push({
        text: data.futureTrend,
        style: "paragraph",
      });
    }

    // PDFドキュメントの定義
    const docDefinition: TDocumentDefinitions = {
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
              alignment: "left",
              margin: [40, 0, 0, 0],
            },
            {
              text: executor.name,
              alignment: "center",
            },
            {
              text: currentPage.toString() + " / " + pageCount,
              alignment: "right",
              margin: [0, 0, 40, 0],
            },
          ],
        } as ContentColumns;
      },
      defaultStyle: {
        font: "IPAGothic",
        fontSize: 10,
      },
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          alignment: "center",
          margin: [0, 0, 0, 20],
        },
        subheader: {
          fontSize: 14,
          bold: true,
          margin: [0, 15, 0, 10],
        },
        paragraph: {
          margin: [0, 5, 0, 10],
        },
        note: {
          fontSize: 8,
          italics: true,
          margin: [0, 5, 0, 10],
        },
      },
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

        pdfDoc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
