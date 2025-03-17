// frontend/src/app/dashboard/progress/page.tsx
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  TrendingUp,
  BarChart as IconBarChart,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Medal,
  Target,
  ArrowUpRight,
  Layers,
  List,
  Star,
  Calendar,
} from "lucide-react";

// recharts コンポーネント
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
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

// 進捗状況の型定義
interface ProgressSummary {
  userId: number;
  reviewCount: number;
  submissionCount: number;
  currentLevel: string;
  skillScores: {
    codeQuality: number;
    readability: number;
    efficiency: number;
    bestPractices: number;
  };
  levelHistory: {
    level: string;
    date: string;
    reviewId: number;
  }[];
  feedbackSummary: {
    totalFeedbacks: number;
    priorityDistribution: { priority: string; count: number }[];
    typeDistribution: { type: string; count: number }[];
    improvement: {
      resolvedRate: number;
      improvementByType: {
        type: string;
        initial: number;
        current: number;
      }[];
    };
  };
}

interface ReviewHistoryItem {
  id: number;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
  submissionCount: number;
  latestVersion: number;
  feedbackCount: number;
  level: string | null;
}

interface GrowthTrendItem {
  month: string;
  codeQuality: number;
  readability: number;
  efficiency: number;
  bestPractices: number;
  overall: number;
}

interface FeedbackStats {
  totalFeedbacks: number;
  priorityDistribution: { priority: string; count: number }[];
  typeDistribution: { type: string; count: number }[];
  improvement: {
    resolvedRate: number;
    improvementByType: {
      type: string;
      initial: number;
      current: number;
    }[];
  };
}

export default function ProgressPage() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryItem[]>([]);
  const [growthTrend, setGrowthTrend] = useState<GrowthTrendItem[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("6months");
  const { user, token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // 進捗概要を取得
  useEffect(() => {
    const fetchProgressSummary = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/progress/summary`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("進捗情報の取得に失敗しました");
        }

        const data = await response.json();
        setSummary(data.data);

        // レビュー履歴を取得
        await fetchReviewHistory();

        // 成長推移データを取得
        await fetchGrowthTrend();

        // フィードバック統計を取得
        await fetchFeedbackStats();
      } catch (error) {
        console.error("進捗情報取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "進捗情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchProgressSummary();
    }
  }, [token, toast]);

  // レビュー履歴を取得
  const fetchReviewHistory = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/progress/review-history`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("レビュー履歴の取得に失敗しました");
      }

      const data = await response.json();
      setReviewHistory(data.data);
    } catch (error) {
      console.error("レビュー履歴取得エラー:", error);
    }
  };

  // 成長推移データを取得
  const fetchGrowthTrend = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/progress/growth-trend?period=${selectedPeriod}`,
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
        `${process.env.NEXT_PUBLIC_API_URL}/api/progress/feedback-stats`,
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

  // 期間変更時の処理
  useEffect(() => {
    if (token) {
      fetchGrowthTrend();
    }
  }, [selectedPeriod, token]);

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  // スキルレベルの色を定義
  const getLevelColor = (level: string) => {
    switch (level) {
      case "A":
        return "#4caf50"; // 緑
      case "B":
        return "#8bc34a"; // 薄緑
      case "C":
        return "#ffeb3b"; // 黄色
      case "D":
        return "#ff9800"; // オレンジ
      case "E":
        return "#f44336"; // 赤
      default:
        return "#9e9e9e"; // グレー
    }
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

  // レビューステータスのバッジを返す
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800">
            完了
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            進行中
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800">
            待機中
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-800">
            {status}
          </Badge>
        );
    }
  };

  // ローディング表示
  if (isLoading && !summary) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">進捗状況</h1>
            <p className="text-gray-500 mt-1">
              あなたのコーディングスキルの進捗と成長状況
            </p>
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
          <h1 className="text-3xl font-bold">進捗状況</h1>
          <p className="text-gray-500 mt-1">
            {user?.name}さんのコーディングスキルの進捗と成長状況
          </p>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              現在のスキルレベル
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl mr-3"
                style={{
                  backgroundColor: getLevelColor(summary?.currentLevel || "C"),
                }}
              >
                {summary?.currentLevel || "C"}
              </div>
              <div>
                <div className="font-semibold">
                  {getLevelLabel(summary?.currentLevel || "C")}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {summary?.currentLevel === "A"
                    ? "卓越したスキルレベル。チームリーダーとして活躍できる能力を持つ。"
                    : summary?.currentLevel === "B"
                    ? "優れたスキルレベル。自立的に作業し、複雑な課題にも対応できる。"
                    : summary?.currentLevel === "C"
                    ? "良好なスキルレベル。基本的なタスクを自力で完了できる。"
                    : summary?.currentLevel === "D"
                    ? "改善が必要なスキルレベル。基本的な概念を理解しているが、実践力は限られている。"
                    : "基礎的なスキルレベル。継続的なサポートとガイダンスが必要。"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              レビュー・提出状況
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {summary?.reviewCount || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">レビュー総数</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {summary?.submissionCount || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">提出回数</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {summary?.feedbackSummary?.totalFeedbacks || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  フィードバック数
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              スキル詳細スコア
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span>コード品質</span>
                <span>{summary?.skillScores.codeQuality || 0}/100</span>
              </div>
              <Progress
                value={summary?.skillScores.codeQuality || 0}
                className="h-2"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span>可読性</span>
                <span>{summary?.skillScores.readability || 0}/100</span>
              </div>
              <Progress
                value={summary?.skillScores.readability || 0}
                className="h-2"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span>効率性</span>
                <span>{summary?.skillScores.efficiency || 0}/100</span>
              </div>
              <Progress
                value={summary?.skillScores.efficiency || 0}
                className="h-2"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span>ベストプラクティス</span>
                <span>{summary?.skillScores.bestPractices || 0}/100</span>
              </div>
              <Progress
                value={summary?.skillScores.bestPractices || 0}
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 期間選択 */}
      <Card>
        <CardHeader>
          <CardTitle>期間選択</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3months">過去3ヶ月</SelectItem>
              <SelectItem value="6months">過去6ヶ月</SelectItem>
              <SelectItem value="12months">過去12ヶ月</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* チャートとグラフのタブ */}
      <Tabs defaultValue="growth" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full md:w-[600px]">
          <TabsTrigger value="growth">
            <TrendingUp className="h-4 w-4 mr-2" />
            成長推移
          </TabsTrigger>
          <TabsTrigger value="details">
            <IconBarChart className="h-4 w-4 mr-2" />
            詳細分析
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <FileText className="h-4 w-4 mr-2" />
            フィードバック分析
          </TabsTrigger>
        </TabsList>

        {/* 成長推移タブ */}
        <TabsContent value="growth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>スキル成長推移</CardTitle>
              <CardDescription>
                過去
                {selectedPeriod === "3months"
                  ? "3"
                  : selectedPeriod === "6months"
                  ? "6"
                  : "12"}
                ヶ月間のスキル成長グラフ
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={growthTrend}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 0,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="overall"
                      name="総合スコア"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="codeQuality"
                      name="コード品質"
                      stroke="#82ca9d"
                    />
                    <Line
                      type="monotone"
                      dataKey="readability"
                      name="可読性"
                      stroke="#ffc658"
                    />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      name="効率性"
                      stroke="#ff8042"
                    />
                    <Line
                      type="monotone"
                      dataKey="bestPractices"
                      name="ベストプラクティス"
                      stroke="#0088fe"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>レベル推移履歴</CardTitle>
              <CardDescription>スキルレベルの変化履歴</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute top-0 left-7 h-full w-0.5 bg-gray-200"></div>
                <ul className="space-y-4">
                  {summary?.levelHistory.map((history, index) => (
                    <li key={index} className="ml-7 relative">
                      <div
                        className="absolute -left-9 mt-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium z-10"
                        style={{
                          backgroundColor: getLevelColor(history.level),
                        }}
                      >
                        {history.level}
                      </div>
                      <div className="border rounded-md p-3">
                        <div className="flex justify-between">
                          <span className="font-medium">
                            {getLevelLabel(history.level)}
                          </span>
                          <span className="text-sm text-gray-500">
                            {formatDate(history.date)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          レビューID: {history.reviewId}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 詳細分析タブ */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>スキル詳細分析</CardTitle>
              <CardDescription>各スキル要素の詳細評価</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    data={[
                      {
                        subject: "コード品質",
                        A: 100,
                        B: 80,
                        C: 60,
                        D: 40,
                        E: 20,
                        value: summary?.skillScores.codeQuality || 0,
                        fullMark: 100,
                      },
                      {
                        subject: "可読性",
                        A: 100,
                        B: 80,
                        C: 60,
                        D: 40,
                        E: 20,
                        value: summary?.skillScores.readability || 0,
                        fullMark: 100,
                      },
                      {
                        subject: "効率性",
                        A: 100,
                        B: 80,
                        C: 60,
                        D: 40,
                        E: 20,
                        value: summary?.skillScores.efficiency || 0,
                        fullMark: 100,
                      },
                      {
                        subject: "ベストプラクティス",
                        A: 100,
                        B: 80,
                        C: 60,
                        D: 40,
                        E: 20,
                        value: summary?.skillScores.bestPractices || 0,
                        fullMark: 100,
                      },
                    ]}
                  >
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis domain={[0, 100]} />
                    <Radar
                      name="A"
                      dataKey="A"
                      stroke="rgba(76, 175, 80, 0.2)"
                      fill="rgba(76, 175, 80, 0.1)"
                      fillOpacity={0.1}
                    />
                    <Radar
                      name="B"
                      dataKey="B"
                      stroke="rgba(139, 195, 74, 0.2)"
                      fill="rgba(139, 195, 74, 0.1)"
                      fillOpacity={0.1}
                    />
                    <Radar
                      name="C"
                      dataKey="C"
                      stroke="rgba(255, 235, 59, 0.2)"
                      fill="rgba(255, 235, 59, 0.1)"
                      fillOpacity={0.1}
                    />
                    <Radar
                      name="D"
                      dataKey="D"
                      stroke="rgba(255, 152, 0, 0.2)"
                      fill="rgba(255, 152, 0, 0.1)"
                      fillOpacity={0.1}
                    />
                    <Radar
                      name="E"
                      dataKey="E"
                      stroke="rgba(244, 67, 54, 0.2)"
                      fill="rgba(244, 67, 54, 0.1)"
                      fillOpacity={0.1}
                    />
                    <Radar
                      name="あなたのスキル"
                      dataKey="value"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                    />
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-md p-3">
                  <div className="flex items-center text-purple-600 font-medium mb-2">
                    <Medal className="h-4 w-4 mr-1" />
                    現在の強み
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      <span>
                        {(summary?.skillScores.readability ?? 0) >
                          (summary?.skillScores.codeQuality ?? 0) &&
                        (summary?.skillScores.readability ?? 0) >
                          (summary?.skillScores.efficiency ?? 0) &&
                        (summary?.skillScores.readability ?? 0) >
                          (summary?.skillScores.bestPractices ?? 0)
                          ? "コードの可読性が高く、命名規則や構造が適切です"
                          : (summary?.skillScores.codeQuality ?? 0) >
                              (summary?.skillScores.readability ?? 0) &&
                            (summary?.skillScores.codeQuality ?? 0) >
                              (summary?.skillScores.efficiency ?? 0) &&
                            (summary?.skillScores.codeQuality ?? 0) >
                              (summary?.skillScores.bestPractices ?? 0)
                          ? "コード品質が高く、堅牢なコードを書く能力があります"
                          : (summary?.skillScores.efficiency ?? 0) >
                              (summary?.skillScores.readability ?? 0) &&
                            (summary?.skillScores.efficiency ?? 0) >
                              (summary?.skillScores.codeQuality ?? 0) &&
                            (summary?.skillScores.efficiency ?? 0) >
                              (summary?.skillScores.bestPractices ?? 0)
                          ? "効率的なアルゴリズムの選択と実装ができます"
                          : "業界のベストプラクティスに沿ったコードを書くことができます"}
                      </span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                      <span>
                        {(feedbackStats?.improvement?.resolvedRate ?? 0) > 70
                          ? "フィードバックに対する対応率が高く、改善意欲があります"
                          : "継続的に成長する姿勢が見られます"}
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="border rounded-md p-3">
                  <div className="flex items-center text-amber-600 font-medium mb-2">
                    <Target className="h-4 w-4 mr-1" />
                    改善ポイント
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start">
                      <AlertCircle className="h-4 w-4 text-amber-500 mr-2 mt-0.5" />
                      <span>
                        {(summary?.skillScores.readability ?? 0) <
                          (summary?.skillScores.codeQuality ?? 0) &&
                        (summary?.skillScores.readability ?? 0) <
                          (summary?.skillScores.efficiency ?? 0) &&
                        (summary?.skillScores.readability ?? 0) <
                          (summary?.skillScores.bestPractices ?? 0)
                          ? "コードの可読性向上が必要です。より明確な変数名と関数名、適切なコメントを追加しましょう"
                          : (summary?.skillScores.codeQuality ?? 0) <
                              (summary?.skillScores.readability ?? 0) &&
                            (summary?.skillScores.codeQuality ?? 0) <
                              (summary?.skillScores.efficiency ?? 0) &&
                            (summary?.skillScores.codeQuality ?? 0) <
                              (summary?.skillScores.bestPractices ?? 0)
                          ? "コード品質の向上が必要です。テスト駆動開発とリファクタリングを意識しましょう"
                          : (summary?.skillScores.efficiency ?? 0) <
                              (summary?.skillScores.readability ?? 0) &&
                            (summary?.skillScores.efficiency ?? 0) <
                              (summary?.skillScores.codeQuality ?? 0) &&
                            (summary?.skillScores.efficiency ?? 0) <
                              (summary?.skillScores.bestPractices ?? 0)
                          ? "コードの効率性を改善する必要があります。計算量とメモリ使用の最適化を意識しましょう"
                          : "業界標準のベストプラクティスの学習が必要です。コーディング規約の遵守を意識しましょう"}
                      </span>
                    </li>
                    <li className="flex items-start">
                      <AlertCircle className="h-4 w-4 text-amber-500 mr-2 mt-0.5" />
                      <span>
                        {(feedbackStats?.priorityDistribution.find(
                          (p) => p.priority === "high"
                        )?.count || 0) > 5
                          ? "高優先度の問題に対する対応が必要です。特にセキュリティとパフォーマンスに関する課題に注目しましょう"
                          : "フィードバックに基づく改善の継続と、新しい技術の学習が推奨されます"}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>レビュー履歴</CardTitle>
              <CardDescription>過去のレビュー提出履歴</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル</TableHead>
                      <TableHead>提出回数</TableHead>
                      <TableHead>フィードバック</TableHead>
                      <TableHead>レベル</TableHead>
                      <TableHead>状態</TableHead>
                      <TableHead>提出日</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewHistory.map((review) => (
                      <TableRow key={review.id}>
                        <TableCell className="font-medium">
                          {review.title}
                        </TableCell>
                        <TableCell>
                          {review.submissionCount}回 (v{review.latestVersion})
                        </TableCell>
                        <TableCell>{review.feedbackCount}件</TableCell>
                        <TableCell>
                          {review.level ? (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                              style={{
                                backgroundColor: getLevelColor(review.level),
                              }}
                            >
                              {review.level}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(review.status)}</TableCell>
                        <TableCell>
                          {formatDate(review.updated_at || review.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/reviews/${review.id}`}>
                              詳細
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* フィードバック分析タブ */}
        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>フィードバック対応率</CardTitle>
              <CardDescription>
                これまでのフィードバックへの対応状況
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center md:justify-between">
                  <div className="w-48 h-48 mb-4 md:mb-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            {
                              name: "対応済み",
                              value:
                                (feedbackStats?.totalFeedbacks || 0) *
                                (feedbackStats?.improvement.resolvedRate || 0) *
                                0.01,
                            },
                            {
                              name: "未対応",
                              value:
                                (feedbackStats?.totalFeedbacks || 0) *
                                (100 -
                                  (feedbackStats?.improvement.resolvedRate ||
                                    0)) *
                                0.01,
                            },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          fill="#8884d8"
                          paddingAngle={2}
                          dataKey="value"
                        >
                          <Cell fill="#4caf50" />
                          <Cell fill="#f44336" />
                        </Pie>
                        <Tooltip
                          formatter={(value) => [
                            `${Math.round(Number(value))}件`,
                            "",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="md:flex-1 md:ml-8">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                          <span className="text-sm">
                            対応済み ({feedbackStats?.improvement.resolvedRate}
                            %)
                          </span>
                        </div>
                        <span className="text-sm font-medium">
                          {Math.round(
                            ((feedbackStats?.totalFeedbacks || 0) *
                              (feedbackStats?.improvement.resolvedRate || 0)) /
                              100
                          )}
                          件
                        </span>
                      </div>
                      <Progress
                        value={feedbackStats?.improvement.resolvedRate || 0}
                        className="h-2"
                        indicatorColor="bg-green-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                          <span className="text-sm">
                            未対応 (
                            {100 -
                              (feedbackStats?.improvement.resolvedRate || 0)}
                            %)
                          </span>
                        </div>
                        <span className="text-sm font-medium">
                          {Math.round(
                            ((feedbackStats?.totalFeedbacks || 0) *
                              (100 -
                                (feedbackStats?.improvement.resolvedRate ||
                                  0))) /
                              100
                          )}
                          件
                        </span>
                      </div>
                      <Progress
                        value={
                          100 - (feedbackStats?.improvement.resolvedRate || 0)
                        }
                        className="h-2 bg-gray-200"
                        indicatorColor="bg-red-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-3">優先度別フィードバック</h3>
                  <div className="flex flex-wrap gap-4">
                    <div className="p-4 border rounded-md flex-1 min-w-[200px]">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                        <span className="font-medium">高優先度</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {feedbackStats?.priorityDistribution.find(
                          (p) => p.priority === "high"
                        )?.count || 0}
                        <span className="text-sm font-normal text-gray-500 ml-1">
                          件
                        </span>
                      </p>
                    </div>
                    <div className="p-4 border rounded-md flex-1 min-w-[200px]">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 bg-amber-500 rounded-full mr-2"></div>
                        <span className="font-medium">中優先度</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {feedbackStats?.priorityDistribution.find(
                          (p) => p.priority === "medium"
                        )?.count || 0}
                        <span className="text-sm font-normal text-gray-500 ml-1">
                          件
                        </span>
                      </p>
                    </div>
                    <div className="p-4 border rounded-md flex-1 min-w-[200px]">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                        <span className="font-medium">低優先度</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {feedbackStats?.priorityDistribution.find(
                          (p) => p.priority === "low"
                        )?.count || 0}
                        <span className="text-sm font-normal text-gray-500 ml-1">
                          件
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>フィードバックタイプ分布</CardTitle>
              <CardDescription>フィードバック項目の種類別分布</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={feedbackStats?.typeDistribution || []}
                    layout="vertical"
                    margin={{
                      top: 20,
                      right: 30,
                      left: 100,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="type" type="category" scale="band" />
                    <Tooltip formatter={(value) => [`${value}件`, "件数"]} />
                    <Bar dataKey="count" name="件数" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>スキル改善グラフ</CardTitle>
              <CardDescription>
                フィードバックにより改善されたスキル
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={feedbackStats?.improvement.improvementByType || []}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="initial" name="初期値" fill="#ff8042" />
                    <Bar dataKey="current" name="現在値" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 次のステップ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <ArrowUpRight className="h-5 w-5 mr-2" />
            次のステップ
          </CardTitle>
          <CardDescription>スキル向上のための推奨アクション</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-4">
              <div className="bg-blue-100 p-2 rounded-full">
                <Layers className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">追加の学習リソース</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {summary?.currentLevel === "E" ||
                  summary?.currentLevel === "D"
                    ? "基礎的なプログラミングスキルの強化が必要です。オンラインコースや書籍での学習を推奨します。"
                    : summary?.currentLevel === "C"
                    ? "特定の技術領域での専門性を高めましょう。より複雑なプロジェクトへの参加を推奨します。"
                    : "他のチームメンバーへの知識共有とメンタリングを始めましょう。リーダーシップスキルの向上に取り組んでください。"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="bg-green-100 p-2 rounded-full">
                <List className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium">重点的に取り組むべき領域</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {(summary?.skillScores.readability ?? 0) <
                    (summary?.skillScores.codeQuality ?? 0) &&
                  (summary?.skillScores.readability ?? 0) <
                    (summary?.skillScores.efficiency ?? 0) &&
                  (summary?.skillScores.readability ?? 0) <
                    (summary?.skillScores.bestPractices ?? 0)
                    ? "コードの可読性向上に取り組みましょう。変数名や関数名の命名規則を見直し、適切なコメントを追加してください。"
                    : (summary?.skillScores.codeQuality ?? 0) <
                        (summary?.skillScores.readability ?? 0) &&
                      (summary?.skillScores.codeQuality ?? 0) <
                        (summary?.skillScores.efficiency ?? 0) &&
                      (summary?.skillScores.codeQuality ?? 0) <
                        (summary?.skillScores.bestPractices ?? 0)
                    ? "コード品質の向上に取り組みましょう。ユニットテストの作成とリファクタリングを行ってください。"
                    : (summary?.skillScores.efficiency ?? 0) <
                        (summary?.skillScores.readability ?? 0) &&
                      (summary?.skillScores.efficiency ?? 0) <
                        (summary?.skillScores.codeQuality ?? 0) &&
                      (summary?.skillScores.efficiency ?? 0) <
                        (summary?.skillScores.bestPractices ?? 0)
                    ? "コードの効率性改善に取り組みましょう。アルゴリズムの最適化とパフォーマンス改善に集中してください。"
                    : "業界標準のベストプラクティスの学習に取り組みましょう。デザインパターンとアーキテクチャの理解を深めてください。"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="bg-purple-100 p-2 rounded-full">
                <Star className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium">目標レベル</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {summary?.currentLevel === "E"
                    ? "レベルDへの到達を目指しましょう。基本的なコーディングスキルの習得と実用的なプログラムの作成能力を向上させてください。"
                    : summary?.currentLevel === "D"
                    ? "レベルCへの到達を目指しましょう。コード品質と可読性に重点を置き、ベストプラクティスの学習を進めてください。"
                    : summary?.currentLevel === "C"
                    ? "レベルBへの到達を目指しましょう。より複雑な問題解決能力と効率的なコーディングスキルの習得に取り組んでください。"
                    : summary?.currentLevel === "B"
                    ? "レベルAへの到達を目指しましょう。高度な技術知識とリーダーシップスキルの開発に集中してください。"
                    : "専門性をさらに高め、チーム全体のスキル向上に貢献しましょう。技術的な指導やメンタリングの役割を担うことを検討してください。"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="bg-amber-100 p-2 rounded-full">
                <Calendar className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-medium">次回のチェックポイント</h3>
                <p className="text-sm text-gray-600 mt-1">
                  3つ以上の新しいコードレビューを完了させ、現在のフィードバックに対応したら、スキルレベルの再評価を行います。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
