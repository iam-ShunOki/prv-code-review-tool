// frontend/src/app/dashboard/analytics/compact.jsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

export default function CompactAnalyticsDashboard() {
  const [summary, setSummary] = useState(null);
  const [growthTrend, setGrowthTrend] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const [selectedYear, setSelectedYear] = useState("");
  const [joinYears, setJoinYears] = useState([]);
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // スキルレベルの色を定義
  const skillLevelColors = {
    A: "#4caf50", // 緑
    B: "#8bc34a", // 黄緑
    C: "#ffeb3b", // 黄色
    D: "#ff9800", // オレンジ
    E: "#f44336", // 赤
  };

  // サンプルデータ (APIから取得するまでの仮データ)
  const sampleData = {
    traineeCount: 46,
    reviewCount: 235,
    submissionCount: 412,
    totalFeedbacks: 1249,
    skillDistribution: [
      { level: "A", count: 5 },
      { level: "B", count: 12 },
      { level: "C", count: 18 },
      { level: "D", count: 8 },
      { level: "E", count: 3 },
    ],
    growthTrend: [
      { month: "1月", value: 65 },
      { month: "2月", value: 68 },
      { month: "3月", value: 72 },
      { month: "4月", value: 75 },
      { month: "5月", value: 79 },
      { month: "6月", value: 82 },
    ],
    feedbackStats: [
      { type: "コード構造", count: 45, percentage: 30 },
      { type: "変数命名", count: 32, percentage: 21 },
      { type: "パフォーマンス", count: 28, percentage: 18 },
      { type: "セキュリティ", count: 24, percentage: 16 },
      { type: "コメント不足", count: 22, percentage: 15 },
    ],
  };

  // ダッシュボードデータを取得
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);

        // 実際のAPI呼び出し（ここではサンプルデータを使用）
        // const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analytics/dashboard-summary`, {
        //   headers: {
        //     Authorization: `Bearer ${token}`,
        //   },
        // });
        // if (!response.ok) throw new Error("データの取得に失敗しました");
        // const data = await response.json();
        // setSummary(data.data);

        // サンプルデータで初期化
        setSummary(sampleData);
        setGrowthTrend(sampleData.growthTrend);
        setFeedbackStats(sampleData.feedbackStats);

        // 入社年度の仮データ
        setJoinYears([2021, 2022, 2023, 2024]);
      } catch (error) {
        console.error("ダッシュボードデータ取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "データの取得に失敗しました",
          variant: "destructive",
        });
      } finally {
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
      title: "エクスポート",
      description: "データのエクスポートを開始しました",
    });
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-60 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ヘッダーとフィルター */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">分析ダッシュボード</h1>
          <p className="text-sm text-gray-500">
            新入社員の成長と進捗状況の分析
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select
            value={selectedYear}
            onValueChange={setSelectedYear}
            className="w-32"
          >
            <SelectTrigger className="h-8 text-xs">
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

          <Select
            value={selectedPeriod}
            onValueChange={setSelectedPeriod}
            className="w-32"
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="6ヶ月" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3months">3ヶ月</SelectItem>
              <SelectItem value="6months">6ヶ月</SelectItem>
              <SelectItem value="12months">12ヶ月</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            className="h-8 text-xs"
          >
            リセット
          </Button>

          <Button size="sm" onClick={handleExport} className="h-8 text-xs">
            エクスポート
          </Button>
        </div>
      </div>

      {/* サマリーカード - 4つのKPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center">
            <div className="bg-blue-100 p-2 rounded-full mr-3">
              <span className="flex items-center justify-center h-4 w-4 text-blue-600 font-bold text-xs">
                U
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500">新入社員数</p>
              <p className="text-lg font-bold">
                {summary?.traineeCount || 0}名
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center">
            <div className="bg-green-100 p-2 rounded-full mr-3">
              <span className="flex items-center justify-center h-4 w-4 text-green-600 font-bold text-xs">
                R
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500">レビュー総数</p>
              <p className="text-lg font-bold">{summary?.reviewCount || 0}件</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center">
            <div className="bg-purple-100 p-2 rounded-full mr-3">
              <span className="flex items-center justify-center h-4 w-4 text-purple-600 font-bold text-xs">
                S
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500">提出総数</p>
              <p className="text-lg font-bold">
                {summary?.submissionCount || 0}回
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center">
            <div className="bg-amber-100 p-2 rounded-full mr-3">
              <span className="flex items-center justify-center h-4 w-4 text-amber-600 font-bold text-xs">
                F
              </span>
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

      {/* 主要グラフ - 2列x2行のグリッド */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* スキルレベル分布 */}
        <Card className="shadow-sm">
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
                <span className="text-blue-500 text-xs font-bold">分布</span>
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
                        fill={skillLevelColors[entry.level]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 成長推移グラフ */}
        <Card className="shadow-sm">
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
                <span className="text-green-500 text-xs font-bold">推移</span>
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
        <Card className="shadow-sm">
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
                <span className="text-purple-500 text-xs font-bold">内訳</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
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
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* スキル要素レーダーチャート */}
        <Card className="shadow-sm">
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
                <span className="text-amber-500 text-xs font-bold">分析</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  outerRadius={60}
                  data={[
                    {
                      subject: "コード品質",
                      今月: 80,
                      先月: 65,
                      fullMark: 100,
                    },
                    { subject: "可読性", 今月: 75, 先月: 60, fullMark: 100 },
                    { subject: "効率性", 今月: 70, 先月: 55, fullMark: 100 },
                    {
                      subject: "ベストプラクティス",
                      今月: 85,
                      先月: 70,
                      fullMark: 100,
                    },
                    {
                      subject: "ドキュメント",
                      今月: 65,
                      先月: 50,
                      fullMark: 100,
                    },
                  ]}
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} />
                  <Radar
                    name="今月"
                    dataKey="今月"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.6}
                  />
                  <Radar
                    name="先月"
                    dataKey="先月"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 優先度別フィードバック */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium">
              優先度別フィードバック
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "高優先度", value: 25, color: "#f44336" },
                      { name: "中優先度", value: 50, color: "#ff9800" },
                      { name: "低優先度", value: 25, color: "#4caf50" },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={40}
                    dataKey="value"
                  >
                    {[
                      { name: "高優先度", value: 25, color: "#f44336" },
                      { name: "中優先度", value: 50, color: "#ff9800" },
                      { name: "低優先度", value: 25, color: "#4caf50" },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value}%`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-1 text-xs mt-2">
              {[
                { name: "高優先度", color: "#f44336" },
                { name: "中優先度", color: "#ff9800" },
                { name: "低優先度", color: "#4caf50" },
              ].map((item) => (
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
        </Card>

        {/* 月間進捗 */}
        <Card className="shadow-sm">
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
        </Card>

        {/* 最近のアクティビティ */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium">
              最近のアクティビティ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2 text-xs">
              <div className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <span className="text-blue-600 font-bold text-[10px]">F</span>
                </div>
                <div>
                  <p className="font-medium">田中 太郎</p>
                  <p className="text-gray-500">コードを提出しました</p>
                  <p className="text-gray-400 text-[10px]">今日 14:30</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <span className="text-green-600 font-bold text-[10px]">
                    B
                  </span>
                </div>
                <div>
                  <p className="font-medium">佐藤 花子</p>
                  <p className="text-gray-500">フィードバックに対応しました</p>
                  <p className="text-gray-400 text-[10px]">今日 13:15</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* スキルレベル詳細 */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between">
            <CardTitle className="text-sm font-medium">
              スキルレベル詳細分布
            </CardTitle>
            <Button variant="link" size="sm" className="h-6 p-0">
              詳細を見る
            </Button>
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
      </Card>
    </div>
  );
}
