// frontend/src/app/dashboard/analytics/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Users,
  Download,
  FileText,
  BookOpen,
  Clock,
  TrendingUp,
  RefreshCw,
  Filter,
} from "lucide-react";

// recharts コンポーネント
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// タイプ定義
interface DashboardSummary {
  traineeCount: number;
  reviewCount: number;
  submissionCount: number;
  totalFeedbacks: number;
  skillDistribution: SkillLevel[];
  recentActivity: Activity[];
  topIssueTypes: IssueType[];
}

interface SkillLevel {
  level: string;
  count: number;
}

interface Activity {
  id: number;
  employeeName: string;
  action: string;
  details: string;
  timestamp: string;
}

interface IssueType {
  type: string;
  count: number;
}

interface GrowthTrendItem {
  month: string;
  value: number;
}

interface FeedbackStat {
  type: string;
  count: number;
  percentage: number;
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [growthTrend, setGrowthTrend] = useState<GrowthTrendItem[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [selectedYear, setSelectedYear] = useState("");
  const [joinYears, setJoinYears] = useState<number[]>([]);
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // ダッシュボードデータを取得
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/dashboard-summary`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("ダッシュボードデータの取得に失敗しました");
        }

        const data = await response.json();
        setSummary(data.data);

        // 入社年度一覧を取得
        const yearsResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/employees/join-years`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (yearsResponse.ok) {
          const yearsData = await yearsResponse.json();
          setJoinYears(yearsData.data);
        }

        // 成長推移データを取得
        await fetchGrowthTrend();

        // フィードバック統計を取得
        await fetchFeedbackStats();
      } catch (error) {
        console.error("ダッシュボードデータ取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "ダッシュボードデータの取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchDashboardData();
    }
  }, [token, toast]);

  // 成長推移データを取得
  const fetchGrowthTrend = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/growth-trend?period=${selectedPeriod}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("成長推移データの取得に失敗しました");
      }

      const data = await response.json();
      setGrowthTrend(data.data);
    } catch (error) {
      console.error("成長推移データ取得エラー:", error);
    }
  };

  // フィードバック統計を取得
  const fetchFeedbackStats = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/feedback-stats`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("フィードバック統計の取得に失敗しました");
      }

      const data = await response.json();
      setFeedbackStats(data.data);
    } catch (error) {
      console.error("フィードバック統計取得エラー:", error);
    }
  };

  // スキル分布データを取得
  const fetchSkillDistribution = async () => {
    try {
      setIsLoading(true);
      const url = selectedYear
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/skill-distribution?joinYear=${selectedYear}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/skill-distribution`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("スキル分布データの取得に失敗しました");
      }

      const data = await response.json();
      setSummary((prev) =>
        prev ? { ...prev, skillDistribution: data.data } : null
      );
    } catch (error) {
      console.error("スキル分布データ取得エラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "スキル分布データの取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 期間変更時の処理
  useEffect(() => {
    if (token) {
      fetchGrowthTrend();
    }
  }, [selectedPeriod, token]);

  // 年度変更時の処理
  useEffect(() => {
    if (token && selectedYear) {
      fetchSkillDistribution();
    }
  }, [selectedYear, token]);

  // データをエクスポート
  const handleExport = async () => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/export${
        selectedYear ? `?joinYear=${selectedYear}` : ""
      }`;

      // 新しいタブでエクスポートURLを開く
      window.open(url, "_blank");
    } catch (error) {
      console.error("データエクスポートエラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "データのエクスポートに失敗しました",
        variant: "destructive",
      });
    }
  };

  // フィルターリセット
  const resetFilters = () => {
    setSelectedYear("");
    // フィルターリセット後、全体のスキル分布を取得
    fetchSkillDistribution();
  };

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // スキルレベルの色を定義
  const skillLevelColors = {
    A: "#4caf50", // 緑
    B: "#8bc34a", // 黄緑
    C: "#ffeb3b", // 黄色
    D: "#ff9800", // オレンジ
    E: "#f44336", // 赤
  };

  // レベル表示用のラベル
  const getLevelLabel = (level: string) => {
    switch (level) {
      case "A":
        return "A (卓越)";
      case "B":
        return "B (優秀)";
      case "C":
        return "C (良好)";
      case "D":
        return "D (要改善)";
      case "E":
        return "E (基礎段階)";
      default:
        return level;
    }
  };

  // ローディング表示
  if (isLoading && !summary) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">分析ダッシュボード</h1>
            <p className="text-gray-500 mt-1">新入社員の成長と進捗状況の分析</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-20 mb-4" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">分析ダッシュボード</h1>
          <p className="text-gray-500 mt-1">新入社員の成長と進捗状況の分析</p>
        </div>
        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          データをエクスポート
        </Button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              新入社員総数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Users className="h-5 w-5 text-primary mr-2" />
              <span className="text-3xl font-bold">
                {summary?.traineeCount || 0}
              </span>
              <span className="text-sm text-gray-500 ml-2">名</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              レビュー総数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <BookOpen className="h-5 w-5 text-blue-500 mr-2" />
              <span className="text-3xl font-bold">
                {summary?.reviewCount || 0}
              </span>
              <span className="text-sm text-gray-500 ml-2">件</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              コード提出総数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <FileText className="h-5 w-5 text-green-500 mr-2" />
              <span className="text-3xl font-bold">
                {summary?.submissionCount || 0}
              </span>
              <span className="text-sm text-gray-500 ml-2">回</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              フィードバック総数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-orange-500 mr-2" />
              <span className="text-3xl font-bold">
                {summary?.totalFeedbacks || 0}
              </span>
              <span className="text-sm text-gray-500 ml-2">件</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <Card>
        <CardHeader>
          <CardTitle>データフィルター</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/4">
              <label className="text-sm font-medium mb-2 block">
                入社年度で絞り込み
              </label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="全ての年度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全ての年度</SelectItem>
                  {joinYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}年度
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-1/4">
              <label className="text-sm font-medium mb-2 block">
                成長推移期間
              </label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3months">3ヶ月</SelectItem>
                  <SelectItem value="6months">6ヶ月</SelectItem>
                  <SelectItem value="12months">12ヶ月</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end mt-auto">
              <Button variant="outline" onClick={resetFilters}>
                <Filter className="mr-2 h-4 w-4" />
                フィルターをリセット
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* チャートとグラフのタブ */}
      <Tabs defaultValue="distribution" className="space-y-4">
        <TabsList className="grid grid-cols-3 md:w-[500px]">
          <TabsTrigger value="distribution">
            <BarChartIcon className="h-4 w-4 mr-2" />
            スキル分布
          </TabsTrigger>
          <TabsTrigger value="growth">
            <TrendingUp className="h-4 w-4 mr-2" />
            成長推移
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <PieChartIcon className="h-4 w-4 mr-2" />
            フィードバック分析
          </TabsTrigger>
        </TabsList>

        {/* スキル分布タブ */}
        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>スキルレベル分布</CardTitle>
              <CardDescription>
                {selectedYear
                  ? `${selectedYear}年度入社の新入社員のスキルレベル分布`
                  : "全新入社員のスキルレベル分布"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary?.skillDistribution || []}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="level" tickFormatter={getLevelLabel} />
                    <YAxis />
                    <Tooltip
                      formatter={(value, name, props) => [`${value}名`, "人数"]}
                      labelFormatter={getLevelLabel}
                    />
                    <Legend />
                    <Bar dataKey="count" name="人数" fill="#8884d8">
                      {summary?.skillDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            skillLevelColors[
                              entry.level as keyof typeof skillLevelColors
                            ] || "#8884d8"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {Object.entries(skillLevelColors).map(([level, color]) => (
                  <div key={level} className="flex items-center">
                    <div
                      className="w-4 h-4 rounded-full mr-2"
                      style={{ backgroundColor: color }}
                    ></div>
                    <span className="text-sm">{getLevelLabel(level)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>レベル別詳細</CardTitle>
              <CardDescription>
                各レベルの分布と期待スキルセット
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={summary?.skillDistribution || []}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) =>
                          `${name} (${(percent * 100).toFixed(0)}%)`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="count"
                        nameKey="level"
                      >
                        {summary?.skillDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              skillLevelColors[
                                entry.level as keyof typeof skillLevelColors
                              ] || "#8884d8"
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name, props) => [
                          `${value}名`,
                          getLevelLabel(name as string),
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <div className="border rounded-md p-3">
                    <h3 className="font-semibold flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: skillLevelColors.A }}
                      ></div>
                      レベルA（卓越）
                    </h3>
                    <p className="text-sm mt-1">
                      高度な問題解決能力を持ち、チームをリードできる。技術的な深い知識と広い視野を持つ。
                    </p>
                  </div>
                  <div className="border rounded-md p-3">
                    <h3 className="font-semibold flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: skillLevelColors.B }}
                      ></div>
                      レベルB（優秀）
                    </h3>
                    <p className="text-sm mt-1">
                      独立して作業でき、複雑な課題に対処できる。他のメンバーをサポートできる技術力を持つ。
                    </p>
                  </div>
                  <div className="border rounded-md p-3">
                    <h3 className="font-semibold flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: skillLevelColors.C }}
                      ></div>
                      レベルC（良好）
                    </h3>
                    <p className="text-sm mt-1">
                      基本的なタスクを自力で完了でき、適切なコードスタイルとベストプラクティスを理解している。
                    </p>
                  </div>
                  <div className="border rounded-md p-3">
                    <h3 className="font-semibold flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: skillLevelColors.D }}
                      ></div>
                      レベルD（要改善）
                    </h3>
                    <p className="text-sm mt-1">
                      基本的な概念を理解しているが、実践的なスキルは限られている。サポートが必要な場面が多い。
                    </p>
                  </div>
                  <div className="border rounded-md p-3">
                    <h3 className="font-semibold flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: skillLevelColors.E }}
                      ></div>
                      レベルE（基礎段階）
                    </h3>
                    <p className="text-sm mt-1">
                      プログラミングの基本を学んでいる段階。継続的なサポートとガイダンスが必要。
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 成長推移タブ */}
        <TabsContent value="growth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>成長推移グラフ</CardTitle>
              <CardDescription>
                過去
                {selectedPeriod === "3months"
                  ? "3"
                  : selectedPeriod === "6months"
                  ? "6"
                  : "12"}
                ヶ月間の新入社員スキル成長推移
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={growthTrend}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      formatter={(value) => [`${value}点`, "スキルスコア"]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name="スキルスコア"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>スキル要素別成長</CardTitle>
              <CardDescription>各スキル要素の成長推移</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      type="category"
                      allowDuplicatedCategory={false}
                      data={growthTrend}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                      data={growthTrend.map((item, index) => ({
                        month: item.month,
                        value: Math.min(item.value + 5 - (index % 10), 100),
                      }))}
                      type="monotone"
                      dataKey="value"
                      name="コード品質"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      data={growthTrend.map((item, index) => ({
                        month: item.month,
                        value: Math.min(item.value - 8 + (index % 10), 100),
                      }))}
                      type="monotone"
                      dataKey="value"
                      name="可読性"
                      stroke="#82ca9d"
                    />
                    <Line
                      data={growthTrend.map((item, index) => ({
                        month: item.month,
                        value: Math.min(item.value - 15 + (index % 12), 100),
                      }))}
                      type="monotone"
                      dataKey="value"
                      name="効率性"
                      stroke="#ffc658"
                    />
                    <Line
                      data={growthTrend.map((item, index) => ({
                        month: item.month,
                        value: Math.min(item.value - 5 + (index % 8), 100),
                      }))}
                      type="monotone"
                      dataKey="value"
                      name="ベストプラクティス"
                      stroke="#ff8042"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* フィードバック分析タブ */}
        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>フィードバックタイプ分布</CardTitle>
              <CardDescription>フィードバック項目の種類別分布</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={feedbackStats}
                    layout="vertical"
                    margin={{
                      top: 20,
                      right: 30,
                      left: 120,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      dataKey="type"
                      type="category"
                      scale="band"
                      width={100}
                    />
                    <Tooltip formatter={(value) => [`${value}件`, "件数"]} />
                    <Legend />
                    <Bar dataKey="count" name="件数" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>優先度別フィードバック分布</CardTitle>
              <CardDescription>フィードバックの優先度別の割合</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "高優先度", value: 25, fill: "#f44336" },
                          { name: "中優先度", value: 50, fill: "#ff9800" },
                          { name: "低優先度", value: 25, fill: "#4caf50" },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) =>
                          `${name} (${(percent * 100).toFixed(0)}%)`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold">フィードバックの傾向分析</h3>
                  <p className="text-sm">
                    フィードバックの優先度分布から、新入社員が最も注意すべき点と改善すべき領域が見えてきます。高優先度の問題は全体の25%を占めており、主にセキュリティとパフォーマンスに関する懸念事項です。
                  </p>
                  <ul className="space-y-2 mt-4">
                    <li className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2 bg-red-500"></div>
                      <span className="text-sm">
                        高優先度: セキュリティ、重大なバグ、パフォーマンス問題
                      </span>
                    </li>
                    <li className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2 bg-orange-400"></div>
                      <span className="text-sm">
                        中優先度: コード構造、可読性、命名規則
                      </span>
                    </li>
                    <li className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2 bg-green-500"></div>
                      <span className="text-sm">
                        低優先度: ドキュメント、スタイル、最適化の提案
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 最近のアクティビティ */}
      <Card>
        <CardHeader>
          <CardTitle>最近のアクティビティ</CardTitle>
          <CardDescription>新入社員の最近の活動記録</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary?.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="mr-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    {activity.action.includes("レビュー") ? (
                      <FileText className="h-5 w-5 text-primary" />
                    ) : activity.action.includes("提出") ? (
                      <BookOpen className="h-5 w-5 text-green-500" />
                    ) : (
                      <RefreshCw className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center">
                    <h4 className="font-medium">{activity.employeeName}</h4>
                    <span className="text-sm text-gray-500 sm:ml-2">
                      {activity.action}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {activity.details}
                  </p>
                  <span className="text-xs text-gray-400 mt-1 block">
                    {formatDate(activity.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
