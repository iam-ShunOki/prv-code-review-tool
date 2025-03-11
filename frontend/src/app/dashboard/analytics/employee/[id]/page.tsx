// frontend/src/app/dashboard/analytics/employee/[id]/page.tsx
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
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  User,
  ChevronRight,
  Download,
  BarChart as BarChartIcon,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Book,
} from "lucide-react";

// recharts コンポーネント
import {
  LineChart,
  Line,
  BarChart, // Rechartsからのインポート
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

// 社員分析データの型定義
interface EmployeeAnalytics {
  employeeId: number;
  name: string;
  email: string;
  department?: string;
  joinYear?: number;
  reviewCount: number;
  currentLevel: string;
  growthTrend: { month: string; value: number }[];
  skillDetails: {
    codeQuality: { value: number; improvement: number };
    readability: { value: number; improvement: number };
    efficiency: { value: number; improvement: number };
    bestPractices: { value: number; improvement: number };
  };
  feedbackStats: {
    totalFeedbacks: number;
    resolvedFeedbacks: number;
    priorityDistribution: { priority: string; count: number }[];
    typeDistribution: { type: string; count: number }[];
  };
}

export default function EmployeeAnalyticsPage({
  params,
}: {
  params: { id: string };
}) {
  const [analytics, setAnalytics] = useState<EmployeeAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // 社員分析データを取得
  useEffect(() => {
    const fetchEmployeeAnalytics = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/employee/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("社員分析データの取得に失敗しました");
        }

        const data = await response.json();
        setAnalytics(data.data);
      } catch (error) {
        console.error("社員分析データ取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "社員分析データの取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchEmployeeAnalytics();
    }
  }, [params.id, token, toast]);

  // データをエクスポート
  const handleExport = async () => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/export?userId=${params.id}`;
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

  // スキルレベルの色を定義
  const getLevelColor = (level: string) => {
    switch (level) {
      case "A":
        return "#4caf50";
      case "B":
        return "#8bc34a";
      case "C":
        return "#ffeb3b";
      case "D":
        return "#ff9800";
      case "E":
        return "#f44336";
      default:
        return "#9e9e9e";
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

  // ローディング表示
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/analytics")}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
          </Button>
          <Skeleton className="h-4 w-40" />
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-4 w-1/3 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/analytics")}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
          </Button>
        </div>
        <Card className="text-center p-10">
          <CardContent>
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">社員情報が見つかりません</h2>
            <p className="text-gray-500 mb-4">
              指定された社員のデータが見つからないか、アクセス権限がありません。
            </p>
            <Button
              onClick={() => router.push("/dashboard/analytics")}
              className="mx-auto"
            >
              分析ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/analytics")}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
          </Button>
          <div className="text-sm text-gray-500">
            <Link href="/dashboard" className="hover:underline">
              ダッシュボード
            </Link>{" "}
            <ChevronRight className="inline h-3 w-3" />{" "}
            <Link href="/dashboard/analytics" className="hover:underline">
              分析
            </Link>{" "}
            <ChevronRight className="inline h-3 w-3" /> {analytics.name}
          </div>
        </div>
        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          データをエクスポート
        </Button>
      </div>

      {/* 社員プロフィール */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">社員プロフィールと概要</CardTitle>
          <CardDescription>
            {analytics.name} ({analytics.email}) の分析概要
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="flex items-start">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mr-4">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{analytics.name}</h3>
                  <p className="text-gray-500">{analytics.email}</p>
                  <div className="mt-2">
                    <div className="text-sm">
                      <span className="text-gray-500 mr-2">部署:</span>
                      {analytics.department || "未設定"}
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500 mr-2">入社年度:</span>
                      {analytics.joinYear
                        ? `${analytics.joinYear}年`
                        : "未設定"}
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500 mr-2">レビュー数:</span>
                      {analytics.reviewCount}件
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  現在のスキルレベル
                </h3>
                <div className="flex items-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl mr-4"
                    style={{
                      backgroundColor: getLevelColor(analytics.currentLevel),
                    }}
                  >
                    {analytics.currentLevel}
                  </div>
                  <div>
                    <div className="font-semibold">
                      {getLevelLabel(analytics.currentLevel)}
                    </div>
                    <p className="text-sm text-gray-600">
                      {analytics.currentLevel === "A"
                        ? "卓越したスキルレベル。チームリーダーとして活躍できる能力を持つ。"
                        : analytics.currentLevel === "B"
                        ? "優れたスキルレベル。自立的に作業し、複雑な課題にも対応できる。"
                        : analytics.currentLevel === "C"
                        ? "良好なスキルレベル。基本的なタスクを自力で完了できる。"
                        : analytics.currentLevel === "D"
                        ? "改善が必要なスキルレベル。基本的な概念を理解しているが、実践力は限られている。"
                        : "基礎的なスキルレベル。継続的なサポートとガイダンスが必要。"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                スキル詳細評価
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    data={[
                      {
                        subject: "コード品質",
                        value: analytics.skillDetails.codeQuality.value,
                        fullMark: 100,
                      },
                      {
                        subject: "可読性",
                        value: analytics.skillDetails.readability.value,
                        fullMark: 100,
                      },
                      {
                        subject: "効率性",
                        value: analytics.skillDetails.efficiency.value,
                        fullMark: 100,
                      },
                      {
                        subject: "ベストプラクティス",
                        value: analytics.skillDetails.bestPractices.value,
                        fullMark: 100,
                      },
                    ]}
                  >
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis domain={[0, 100]} />
                    <Radar
                      name="スキル"
                      dataKey="value"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                    />
                    <Tooltip formatter={(value) => `${value}点`} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {Object.entries(analytics.skillDetails).map(
                  ([key, { value, improvement }]) => (
                    <div key={key} className="flex items-center">
                      <div
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: "#8884d8" }}
                      ></div>
                      <div>
                        <span className="text-xs font-medium">
                          {key === "codeQuality"
                            ? "コード品質"
                            : key === "readability"
                            ? "可読性"
                            : key === "efficiency"
                            ? "効率性"
                            : "ベストプラクティス"}
                          : {value}点
                        </span>
                        <span className="text-xs text-green-600 ml-2">
                          (+{improvement})
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 成長推移グラフ */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              スキル成長推移
            </div>
          </CardTitle>
          <CardDescription>過去12ヶ月間の成長推移</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={analytics.growthTrend}
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

      {/* フィードバック分析 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center">
                <BarChart className="h-5 w-5 mr-2" />
                フィードバックタイプ分布
              </div>
            </CardTitle>
            <CardDescription>
              受け取ったフィードバックのタイプ別割合
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.feedbackStats.typeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="type"
                  >
                    {analytics.feedbackStats.typeDistribution.map(
                      (entry, index) => (
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
                      )
                    )}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}件`, "件数"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                フィードバック対応状況
              </div>
            </CardTitle>
            <CardDescription>フィードバックの優先度と対応状況</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                フィードバック対応率
              </h3>
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">
                      対応済み
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold inline-block text-green-600">
                      {Math.round(
                        (analytics.feedbackStats.resolvedFeedbacks /
                          analytics.feedbackStats.totalFeedbacks) *
                          100
                      )}
                      %
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-200">
                  <div
                    style={{
                      width: `${Math.round(
                        (analytics.feedbackStats.resolvedFeedbacks /
                          analytics.feedbackStats.totalFeedbacks) *
                          100
                      )}%`,
                    }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"
                  ></div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-medium text-gray-500 mb-3">
              優先度別フィードバック分布
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.feedbackStats.priorityDistribution}
                  layout="vertical"
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="priority"
                    type="category"
                    tickFormatter={(value) =>
                      value === "high"
                        ? "高優先度"
                        : value === "medium"
                        ? "中優先度"
                        : "低優先度"
                    }
                  />
                  <Tooltip
                    formatter={(value) => [`${value}件`, "件数"]}
                    labelFormatter={(value) =>
                      value === "high"
                        ? "高優先度"
                        : value === "medium"
                        ? "中優先度"
                        : "低優先度"
                    }
                  />
                  <Bar dataKey="count" name="件数">
                    {analytics.feedbackStats.priorityDistribution.map(
                      (entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.priority === "high"
                              ? "#f44336"
                              : entry.priority === "medium"
                              ? "#ff9800"
                              : "#4caf50"
                          }
                        />
                      )
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* アクションとレコメンデーション */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center">
              <Book className="h-5 w-5 mr-2" />
              推奨アクションと次のステップ
            </div>
          </CardTitle>
          <CardDescription>パフォーマンス向上のための推奨事項</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border rounded-md p-4">
              <h3 className="font-semibold text-lg mb-2">強み</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>
                    {analytics.skillDetails.readability.value > 80
                      ? "コードの可読性が高く、命名規則や構造が適切である"
                      : analytics.skillDetails.codeQuality.value > 80
                      ? "コード品質が高く、堅牢なコードを書く能力がある"
                      : analytics.skillDetails.efficiency.value > 80
                      ? "効率的なアルゴリズムの選択と実装ができる"
                      : analytics.skillDetails.bestPractices.value > 80
                      ? "業界のベストプラクティスに沿ったコードを書くことができる"
                      : "基本的なプログラミングコンセプトをよく理解している"}
                  </span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>
                    {analytics.feedbackStats.resolvedFeedbacks /
                      analytics.feedbackStats.totalFeedbacks >
                    0.8
                      ? "フィードバックに対する対応率が高く、改善意欲がある"
                      : "継続的に成長する姿勢が見られる"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="border rounded-md p-4">
              <h3 className="font-semibold text-lg mb-2">改善点</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                  <span>
                    {analytics.skillDetails.readability.value < 70
                      ? "コードの可読性向上が必要。より明確な変数名と関数名、適切なコメントを追加すること"
                      : analytics.skillDetails.codeQuality.value < 70
                      ? "コード品質の向上が必要。テスト駆動開発とリファクタリングを意識すること"
                      : analytics.skillDetails.efficiency.value < 70
                      ? "コードの効率性を改善する必要がある。計算量とメモリ使用の最適化を意識すること"
                      : analytics.skillDetails.bestPractices.value < 70
                      ? "業界標準のベストプラクティスの学習が必要。コーディング規約の遵守を意識すること"
                      : "全体的なスキルバランスの向上が必要"}
                  </span>
                </li>
                <li className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                  <span>
                    {(analytics.feedbackStats.priorityDistribution.find(
                      (p) => p.priority === "high"
                    )?.count ?? 0) > 5
                      ? "高優先度の問題に対する対応が必要。特にセキュリティとパフォーマンスに関する課題に注目すること"
                      : "フィードバックに基づく改善の継続と、新しい技術の学習が推奨される"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="border rounded-md p-4">
              <h3 className="font-semibold text-lg mb-2">推奨アクション</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <span className="h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs mr-2 mt-0.5">
                    1
                  </span>
                  <span>
                    {analytics.currentLevel === "E" ||
                    analytics.currentLevel === "D"
                      ? "基礎的なプログラミングスキルの強化。オンラインコースや書籍での学習を推奨"
                      : analytics.currentLevel === "C"
                      ? "特定の技術領域での専門性を高める。より複雑なプロジェクトへの参加を推奨"
                      : "他のチームメンバーへの知識共有とメンタリングを推奨。リーダーシップスキルの向上"}
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs mr-2 mt-0.5">
                    2
                  </span>
                  <span>
                    {analytics.skillDetails.efficiency.value < 70
                      ? "パフォーマンス最適化に関するリソースの学習と実践"
                      : analytics.skillDetails.codeQuality.value < 70
                      ? "テスト駆動開発とコード品質向上に関するワークショップへの参加"
                      : "新しい技術トレンドのキャッチアップと実験的プロジェクトへの参加"}
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs mr-2 mt-0.5">
                    3
                  </span>
                  <span>
                    定期的なコードレビューへの積極的な参加と、フィードバックの実装
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/analytics")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            分析ダッシュボードに戻る
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
