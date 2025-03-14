// frontend/src/components/analytics/TraineeRanking.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Award, ChevronRight, User } from "lucide-react";

// ランキングデータの型定義
interface TraineeRankingItem {
  id: number;
  name: string;
  email: string;
  department?: string;
  join_year?: number;
  averageScore: number;
  skillLevel: string;
}

interface TraineeRankingProps {
  joinYear?: string;
  token: string;
  limit?: number;
}

export function TraineeRanking({
  joinYear,
  token,
  limit = 10,
}: TraineeRankingProps) {
  const [ranking, setRanking] = useState<TraineeRankingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // ランキングデータを取得
  useEffect(() => {
    const fetchRanking = async () => {
      try {
        setIsLoading(true);
        let url = `${process.env.NEXT_PUBLIC_API_URL}/api/analytics/trainee-ranking?limit=${limit}`;
        if (joinYear) {
          url += `&joinYear=${joinYear}`;
        }

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("ランキングデータの取得に失敗しました");
        }

        const data = await response.json();
        setRanking(data.data);
      } catch (error) {
        console.error("ランキングデータ取得エラー:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchRanking();
    }
  }, [token, joinYear, limit]);

  // スキルレベルのバッジカラーを定義
  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case "A":
        return "bg-green-100 text-green-800 hover:bg-green-200";
      case "B":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200";
      case "C":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200";
      case "D":
        return "bg-orange-100 text-orange-800 hover:bg-orange-200";
      case "E":
        return "bg-red-100 text-red-800 hover:bg-red-200";
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200";
    }
  };

  // 社員詳細ページに遷移
  const handleRowClick = (id: number) => {
    router.push(`/dashboard/analytics/employee/${id}`);
  };

  // ローディング表示
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>新入社員ランキング</CardTitle>
          <CardDescription>スキルレベルに基づくランキング</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="ml-auto">
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Award className="h-5 w-5 mr-2 text-yellow-500" />
          新入社員ランキング
        </CardTitle>
        <CardDescription>
          {joinYear ? `${joinYear}年度入社の` : "全"}
          新入社員のスキルレベルランキング
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ranking.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            ランキングデータがありません
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">順位</TableHead>
                <TableHead>氏名</TableHead>
                <TableHead>部署</TableHead>
                <TableHead>入社年度</TableHead>
                <TableHead>スキルレベル</TableHead>
                <TableHead className="text-right">スコア</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((trainee, index) => (
                <TableRow
                  key={trainee.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleRowClick(trainee.id)}
                >
                  <TableCell className="font-medium">
                    {index === 0 ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-800">
                        1
                      </span>
                    ) : index === 1 ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-800">
                        2
                      </span>
                    ) : index === 2 ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-800">
                        3
                      </span>
                    ) : (
                      index + 1
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 w-8 h-8 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{trainee.name}</div>
                        <div className="text-xs text-gray-500">
                          {trainee.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{trainee.department || "未設定"}</TableCell>
                  <TableCell>
                    {trainee.join_year ? `${trainee.join_year}年度` : "未設定"}
                  </TableCell>
                  <TableCell>
                    <Badge className={getLevelBadgeColor(trainee.skillLevel)}>
                      {trainee.skillLevel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <div className="flex items-center justify-end gap-1">
                      {trainee.averageScore.toFixed(1)}
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
