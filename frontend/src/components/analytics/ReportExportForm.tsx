// frontend/src/components/analytics/ReportExportForm.tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/contexts/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CalendarIcon,
  Download,
  FileText,
  Loader,
  FileSpreadsheet,
  File,
  FileBarChart2,
  FileCode,
  FileImage,
  Brain,
} from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";

// フォームのバリデーションスキーマ
const formSchema = z.object({
  format: z.enum(["excel", "pdf", "markdown", "graphic"], {
    required_error: "形式を選択してください",
  }),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  joinYear: z.string().optional(),
  department: z.string().optional(),
  includeDetails: z.boolean().default(true),
  includeGrowthTrend: z.boolean().default(true),
  includePrediction: z.boolean().default(true),
  useAI: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface ReportExportFormProps {
  joinYears: number[];
  departments: string[];
}

export function ReportExportForm({
  joinYears,
  departments,
}: ReportExportFormProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      format: "excel",
      includeDetails: true,
      includeGrowthTrend: true,
      includePrediction: true,
      useAI: false,
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsExporting(true);

    try {
      // クエリパラメータを構築
      const params = new URLSearchParams();
      params.append("format", data.format);

      if (data.startDate) {
        params.append("startDate", data.startDate.toISOString());
      }

      if (data.endDate) {
        params.append("endDate", data.endDate.toISOString());
      }

      if (data.joinYear && data.joinYear !== "all") {
        params.append("joinYear", data.joinYear);
      }

      if (data.department && data.department !== "all") {
        params.append("department", data.department);
      }

      params.append("includeDetails", String(data.includeDetails));
      params.append("includeGrowthTrend", String(data.includeGrowthTrend));
      params.append("includePrediction", String(data.includePrediction));
      params.append("useAI", String(data.useAI));

      // API呼び出し
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL
        }/api/analytics/export?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "エクスポートに失敗しました");
      }

      // レスポンスをBlobとして処理
      const blob = await response.blob();

      // ファイル名を取得
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "report.xlsx";

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      } else {
        // デフォルトファイル名を生成
        const date = new Date().toISOString().split("T")[0];
        const ext =
          data.format === "excel"
            ? "xlsx"
            : data.format === "pdf"
            ? "pdf"
            : data.format === "markdown"
            ? "md"
            : "svg";

        filename = `analytics_report_${date}.${ext}`;
      }

      // ダウンロードリンクを作成
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();

      // クリーンアップ
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      const formatLabels = {
        excel: "Excel",
        pdf: "PDF",
        markdown: "Markdown",
        graphic: "グラフィックレコード",
      };

      toast({
        title: "エクスポート完了",
        description: `${
          formatLabels[data.format]
        } レポートのダウンロードが開始されました`,
      });
    } catch (error) {
      console.error("エクスポートエラー:", error);
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error ? error.message : "エクスポートに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 選択されたフォーマットを取得
  const selectedFormat = form.watch("format");

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          分析データを選択した形式でエクスポートします
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-3">
              {/* 出力形式 */}
              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>出力形式</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div
                          className={`flex flex-col items-center justify-center p-4 border rounded-md cursor-pointer hover:bg-slate-50 ${
                            field.value === "excel"
                              ? "border-blue-500 bg-blue-50"
                              : ""
                          }`}
                          onClick={() => field.onChange("excel")}
                        >
                          <FileSpreadsheet className="h-8 w-8 text-green-600 mb-2" />
                          <span className="text-sm font-medium">Excel</span>
                        </div>
                        <div
                          className={`flex flex-col items-center justify-center p-4 border rounded-md cursor-pointer hover:bg-slate-50 ${
                            field.value === "pdf"
                              ? "border-blue-500 bg-blue-50"
                              : ""
                          }`}
                          onClick={() => field.onChange("pdf")}
                        >
                          <File className="h-8 w-8 text-red-600 mb-2" />
                          <span className="text-sm font-medium">PDF</span>
                        </div>
                        <div
                          className={`flex flex-col items-center justify-center p-4 border rounded-md cursor-pointer hover:bg-slate-50 ${
                            field.value === "markdown"
                              ? "border-blue-500 bg-blue-50"
                              : ""
                          }`}
                          onClick={() => field.onChange("markdown")}
                        >
                          <FileCode className="h-8 w-8 text-blue-600 mb-2" />
                          <span className="text-sm font-medium">Markdown</span>
                        </div>
                        <div
                          className={`flex flex-col items-center justify-center p-4 border rounded-md cursor-pointer hover:bg-slate-50 ${
                            field.value === "graphic"
                              ? "border-blue-500 bg-blue-50"
                              : ""
                          }`}
                          onClick={() => field.onChange("graphic")}
                        >
                          <FileImage className="h-8 w-8 text-purple-600 mb-2" />
                          <span className="text-sm font-medium">
                            グラフィック
                          </span>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* 入社年度フィルター */}
                <FormField
                  control={form.control}
                  name="joinYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>入社年度</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="全ての年度" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">全ての年度</SelectItem>
                          {joinYears.map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}年度
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 部署フィルター */}
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>部署</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="全ての部署" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">全ての部署</SelectItem>
                          {departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* 開始日 */}
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>開始日</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`pl-3 text-left font-normal ${
                                !field.value && "text-muted-foreground"
                              }`}
                            >
                              {field.value ? (
                                format(field.value, "yyyy年MM月dd日", {
                                  locale: ja,
                                })
                              ) : (
                                <span>日付を選択</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date: Date) =>
                              form.getValues("endDate")
                                ? date.getTime() >
                                  form.getValues("endDate")!.getTime()
                                : false
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 終了日 */}
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>終了日</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`pl-3 text-left font-normal ${
                                !field.value && "text-muted-foreground"
                              }`}
                            >
                              {field.value ? (
                                format(field.value, "yyyy年MM月dd日", {
                                  locale: ja,
                                })
                              ) : (
                                <span>日付を選択</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date: Date) =>
                              form.getValues("startDate")
                                ? date.getTime() <
                                  form.getValues("startDate")!.getTime()
                                : false
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-medium">含める情報：</div>

              {/* 詳細情報 */}
              <FormField
                control={form.control}
                name="includeDetails"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>社員詳細評価</FormLabel>
                      <FormDescription>
                        各社員のスキルレベルと評価スコアの詳細情報
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* 成長推移 */}
              <FormField
                control={form.control}
                name="includeGrowthTrend"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>成長推移データ</FormLabel>
                      <FormDescription>
                        期間ごとのスキルレベル変化と成長率
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* 予測 */}
              <FormField
                control={form.control}
                name="includePrediction"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>今後の傾向予測</FormLabel>
                      <FormDescription>
                        AIによる将来のスキル成長予測
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* AI分析 */}
              <FormField
                control={form.control}
                name="useAI"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 border-indigo-100 bg-indigo-50">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center">
                        <Brain className="h-4 w-4 mr-2 text-indigo-600" />
                        Claude 3.7 Sonnetによる分析
                      </FormLabel>
                      <FormDescription>
                        AIを活用した詳細な分析と提案
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  エクスポート中...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  レポートをエクスポート
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
