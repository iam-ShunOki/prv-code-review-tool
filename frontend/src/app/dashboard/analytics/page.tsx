// frontend/src/app/dashboard/analytics/page.jsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TraineeRanking } from "@/components/analytics/TraineeRanking";
import { ReportExportForm } from "@/components/analytics/ReportExportForm";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  BarChart3,
  LineChart,
  PieChart,
  Users,
  Download,
  FileText,
  BookOpen,
  Clock,
  TrendingUp,
  RefreshCw,
  Filter,
  LayoutGrid,
  LayoutList,
  Info,
} from "lucide-react";

// recharts コンポーネント
import {
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  PieChart as RechartsPieChart,
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

// サンプルデータ (実際の実装ではAPIから取得するデータ)
const SAMPLE_DATA = {
  traineeCount: 46,
  reviewCount: 200,
  submissionCount: 100,
  totalFeedbacks: 212,
  skillDistribution: [
    { level: "A", count: 5 },
    { level: "B", count: 12 },
    { level: "C", count: 18 },
    { level: "D", count: 8 },
    { level: "E", count: 3 },
  ],
  growthTrend: [
    { month: "4月", value: 45 },
    { month: "5月", value: 47 },
    { month: "6月", value: 56 },
    { month: "7月", value: 56 },
    { month: "8月", value: 70 },
    { month: "9月", value: 79 },
  ],
  feedbackStats: [
    { type: "統一性", count: 45, percentage: 30 },
    { type: "変数命名", count: 32, percentage: 21 },
    { type: "誤字・脱字", count: 28, percentage: 18 },
    { type: "セキュリティ", count: 24, percentage: 16 },
    { type: "構成", count: 22, percentage: 15 },
  ],
  recentActivity: [
    {
      id: 1,
      employeeName: "田中 太郎",
      action: "コードを提出",
      details: "レビュー #42: APIエンドポイント実装",
      timestamp: "2025-03-14T14:30:00Z",
    },
    {
      id: 2,
      employeeName: "佐藤 花子",
      action: "フィードバックに対応",
      details: "レビュー #38: ユーザー認証機能",
      timestamp: "2025-03-14T13:15:00Z",
    },
    {
      id: 3,
      employeeName: "鈴木 一郎",
      action: "レビュー完了",
      details: "レビュー #40: データベース設計",
      timestamp: "2025-03-14T11:45:00Z",
    },
  ],
  priorityDistribution: [
    { name: "高優先度", value: 25, color: "#f44336" },
    { name: "中優先度", value: 50, color: "#ff9800" },
    { name: "低優先度", value: 25, color: "#4caf50" },
  ],
  radarData: [
    { subject: "コード品質", A: 80, B: 65, fullMark: 100 },
    { subject: "可読性", A: 75, B: 60, fullMark: 100 },
    { subject: "提出率", A: 70, B: 55, fullMark: 100 },
    { subject: "修正正確度", A: 85, B: 70, fullMark: 100 },
    { subject: "文章力", A: 65, B: 50, fullMark: 100 },
  ],
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

export default function AnalyticsDashboard() {
  const [summary, setSummary] = useState<typeof SAMPLE_DATA | null>(null);
  const [growthTrend, setGrowthTrend] = useState<
    { month: string; value: number }[]
  >([]);
  const [feedbackStats, setFeedbackStats] = useState<
    { type: string; count: number; percentage: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [selectedYear, setSelectedYear] = useState("");
  const [joinYears, setJoinYears] = useState<number[]>([]);
  const [isCompactView, setIsCompactView] = useState(true); // 表示モード切替用の状態
  const [isExportModalOpen, setIsExportModalOpen] = useState(false); // エクスポートモーダル表示用の状態
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // ダッシュボードデータを取得
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);

        // 実際の実装では下記のようなAPI呼び出しになります
        // const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analytics/dashboard-summary`, {
        //   headers: {
        //     Authorization: `Bearer ${token}`,
        //   },
        // });
        // if (!response.ok) throw new Error("データの取得に失敗しました");
        // const data = await response.json();
        // setSummary(data.data);

        // サンプルデータを使用
        setSummary(SAMPLE_DATA);
        setGrowthTrend(SAMPLE_DATA.growthTrend);
        setFeedbackStats(SAMPLE_DATA.feedbackStats);

        // 入社年度（サンプル）
        setJoinYears([2021, 2022, 2023, 2024]);

        // 少し遅延を入れてローディングを表示（デモ用）
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error("ダッシュボードデータ取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "データの取得に失敗しました",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [token, toast]);

  // フィルターをリセット
  const resetFilters = () => {
    setSelectedYear("");
    setSelectedPeriod("6months");
  };

  // データをエクスポート
  const handleExport = () => {
    toast({
      title: "エクスポート開始",
      description: "データのエクスポートを開始しました",
    });
  };

  // 表示モード切替
  const toggleViewMode = () => {
    setIsCompactView(!isCompactView);
    toast({
      title: isCompactView
        ? "詳細表示に切り替えました"
        : "コンパクト表示に切り替えました",
      duration: 2000,
    });
  };

  // 日付をフォーマット
  const formatDate = (dateString: string | number | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ローディング表示
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  // コンパクト表示コンポーネント
  const CompactView = () => (
    <div className="space-y-4">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center">
            <div className="bg-blue-100 p-2 rounded-full mr-3">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">新入社員数</p>
              <p className="text-lg font-bold">
                {summary?.traineeCount || 0}名
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center">
            <div className="bg-green-100 p-2 rounded-full mr-3">
              <BookOpen className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">レビュー総数</p>
              <p className="text-lg font-bold">{summary?.reviewCount || 0}件</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center">
            <div className="bg-purple-100 p-2 rounded-full mr-3">
              <FileText className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">提出総数</p>
              <p className="text-lg font-bold">
                {summary?.submissionCount || 0}回
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center">
            <div className="bg-amber-100 p-2 rounded-full mr-3">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">フィードバック数</p>
              <p className="text-lg font-bold">
                {summary?.totalFeedbacks || 0}件
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 主要グラフ - 2×2グリッド */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* スキルレベル分布 */}
        <Card>
          <CardHeader className="p-4 pb-0">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-sm font-medium">
                  スキルレベル分布
                </CardTitle>
                <CardDescription className="text-xs">
                  全新入社員のスキルレベル分布
                </CardDescription>
              </div>
              <div className="bg-blue-50 p-1 rounded">
                <BarChart3 className="h-4 w-4 text-blue-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary?.skillDistribution || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="level" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`${value}名`, "人数"]} />
                  <Bar dataKey="count" name="人数">
                    {summary?.skillDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          skillLevelColors[
                            entry.level as keyof typeof skillLevelColors
                          ]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 成長推移グラフ */}
        <Card>
          <CardHeader className="p-4 pb-0">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-sm font-medium">成長推移</CardTitle>
                <CardDescription className="text-xs">
                  過去
                  {selectedPeriod === "3months"
                    ? "3"
                    : selectedPeriod === "6months"
                    ? "6"
                    : "12"}
                  ヶ月間の成長推移
                </CardDescription>
              </div>
              <div className="bg-green-50 p-1 rounded">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip
                    formatter={(value) => [`${value}点`, "スキルスコア"]}
                  />
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

        {/* フィードバックタイプ分布 */}
        <Card>
          <CardHeader className="p-4 pb-0">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-sm font-medium">
                  フィードバックタイプ
                </CardTitle>
                <CardDescription className="text-xs">
                  フィードバック項目の種類別分布
                </CardDescription>
              </div>
              <div className="bg-purple-50 p-1 rounded">
                <PieChart className="h-4 w-4 text-purple-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={feedbackStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={60}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="type"
                  >
                    {feedbackStats.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          [
                            "#8884d8",
                            "#82ca9d",
                            "#ffc658",
                            "#ff8042",
                            "#0088FE",
                          ][index % 5]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value}件`, name]} />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* スキル要素レーダーチャート */}
        <Card>
          <CardHeader className="p-4 pb-0">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-sm font-medium">
                  スキル要素分析
                </CardTitle>
                <CardDescription className="text-xs">
                  スキル要素別の評価比較
                </CardDescription>
              </div>
              <div className="bg-amber-50 p-1 rounded">
                <Info className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart outerRadius={60} data={SAMPLE_DATA.radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} />
                  <Radar
                    name="今月"
                    dataKey="A"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.6}
                  />
                  <Radar
                    name="先月"
                    dataKey="B"
                    stroke="#82ca9d"
                    fill="#82ca9d"
                    fillOpacity={0.6}
                  />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 補助グラフと重要データ - 3列グリッド */}
      {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> */}
      {/* 優先度別フィードバック */}
      {/* <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium">
              優先度別フィードバック
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={SAMPLE_DATA.priorityDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={40}
                    dataKey="value"
                  >
                    {SAMPLE_DATA.priorityDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value}%`, name]} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-1 text-xs mt-2">
              {SAMPLE_DATA.priorityDistribution.map((item) => (
                <div key={item.name} className="flex items-center">
                  <div
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card> */}

      {/* 月間進捗 */}
      {/* <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium">月間進捗状況</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "提出", 今月: 45, 先月: 38 },
                    { name: "クリア", 今月: 35, 先月: 30 },
                    { name: "PR", 今月: 28, 先月: 20 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="今月" fill="#8884d8" />
                  <Bar dataKey="先月" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-center mt-2 text-gray-500">
              提出率 87% - 対応率 78% - PR生成率 62%
            </div>
          </CardContent>
        </Card> */}

      {/* 最近のアクティビティ */}
      {/* <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium">
              最近のアクティビティ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2 text-xs">
              {SAMPLE_DATA.recentActivity.slice(0, 2).map((activity) => (
                <div key={activity.id} className="flex items-start">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                    <div className="text-blue-600 font-bold text-[10px]">
                      {activity.employeeName.charAt(0)}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">{activity.employeeName}</p>
                    <p className="text-gray-500">{activity.action}しました</p>
                    <p className="text-gray-400 text-[10px]">
                      {formatDate(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div> */}

      {/* スキルレベル詳細 */}
      {/* <Card>
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between">
            <CardTitle className="text-sm font-medium">
              スキルレベル詳細分布
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(skillLevelColors).map(([level, color]) => (
              <div key={level} className="border rounded-md p-2 text-center">
                <div
                  className="w-4 h-4 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: color }}
                ></div>
                <div className="text-xs font-medium">{level}</div>
                <div className="text-xs text-gray-500">
                  {summary?.skillDistribution.find(
                    (item) => item.level === level
                  )?.count || 0}
                  名
                </div>
                <div className="text-[10px] mt-1">
                  {level === "A"
                    ? "卓越"
                    : level === "B"
                    ? "優秀"
                    : level === "C"
                    ? "良好"
                    : level === "D"
                    ? "要改善"
                    : "基礎段階"}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card> */}
    </div>
  );

  // 詳細表示コンポーネント
  const DetailedView = () => (
    <div className="space-y-6">
      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">新入社員総数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start">
              <Users className="h-8 w-8 text-primary mr-3" />
              <div>
                <span className="text-3xl font-bold">
                  {summary?.traineeCount || 0}
                </span>
                <span className="text-lg text-gray-500 ml-2">名</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">レビュー総数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start">
              <BookOpen className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <span className="text-3xl font-bold">
                  {summary?.reviewCount || 0}
                </span>
                <span className="text-lg text-gray-500 ml-2">件</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">コード提出総数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start">
              <FileText className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <span className="text-3xl font-bold">
                  {summary?.submissionCount || 0}
                </span>
                <span className="text-lg text-gray-500 ml-2">回</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">フィードバック総数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start">
              <Clock className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <span className="text-3xl font-bold">
                  {summary?.totalFeedbacks || 0}
                </span>
                <span className="text-lg text-gray-500 ml-2">件</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* タブ付きチャート */}
      <Tabs defaultValue="distribution" className="space-y-6">
        <TabsList className="grid grid-cols-3 md:w-[500px]">
          <TabsTrigger value="distribution">
            <BarChart3 className="h-4 w-4 mr-2" />
            スキル分布
          </TabsTrigger>
          <TabsTrigger value="growth">
            <TrendingUp className="h-4 w-4 mr-2" />
            成長推移
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <PieChart className="h-4 w-4 mr-2" />
            フィードバック分析
          </TabsTrigger>
        </TabsList>

        {/* スキル分布タブ */}
        <TabsContent value="distribution" className="space-y-6">
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
        </TabsContent>

        {/* 成長推移タブ */}
        <TabsContent value="growth" className="space-y-6">
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
        </TabsContent>

        {/* フィードバック分析タブ */}
        <TabsContent value="feedback" className="space-y-6">
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
        </TabsContent>
      </Tabs>

      {/* 新入社員ランキング */}
      <TraineeRanking joinYear={selectedYear} token={token || ""} limit={10} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ヘッダーとフィルター */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">分析ダッシュボード</h1>
          <p className="text-sm text-gray-500">
            新入社員の成長と進捗状況の分析
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="全年度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全年度</SelectItem>
              {joinYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}年度
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="6ヶ月" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3months">3ヶ月</SelectItem>
              <SelectItem value="6months">6ヶ月</SelectItem>
              <SelectItem value="12months">12ヶ月</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={resetFilters} className="h-9">
            <Filter className="h-4 w-4 mr-2" />
            リセット
          </Button>
          <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
            <DialogTrigger asChild>
              <Button className="h-9">
                <Download className="h-4 w-4 mr-2" />
                エクスポート
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>レポートエクスポート</DialogTitle>
              </DialogHeader>
              <ReportExportForm joinYears={joinYears} departments={[]} />
            </DialogContent>
          </Dialog>

          {/* 表示モード切替ボタン */}
          <Button
            variant="secondary"
            onClick={toggleViewMode}
            className="h-9 ml-2"
            title={
              isCompactView ? "詳細表示に切り替え" : "コンパクト表示に切り替え"
            }
          >
            {isCompactView ? (
              <>
                <LayoutList className="h-4 w-4 mr-2" />
                詳細表示
              </>
            ) : (
              <>
                <LayoutGrid className="h-4 w-4 mr-2" />
                コンパクト表示
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 表示モードに応じたコンテンツを表示 */}
      {isCompactView ? <CompactView /> : <DetailedView />}
    </div>
  );
}
