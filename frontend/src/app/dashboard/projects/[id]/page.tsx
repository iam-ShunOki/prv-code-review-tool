"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  Calendar,
  GitBranch,
  ClipboardList,
  Edit,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ArchiveIcon,
  PlaneLanding,
  UserPlus,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// プロジェクトの型定義
interface Project {
  id: number;
  name: string;
  code: string;
  description: string;
  status: "planning" | "active" | "completed" | "archived";
  start_date: string | null;
  end_date: string | null;
  backlog_project_key: string | null;
  backlog_repository_names: string | null;
  created_at: string;
  updated_at: string;
  userProjects: {
    id: number;
    user_id: number;
    role: "leader" | "member" | "reviewer" | "observer";
    joined_at: string;
    user: {
      id: number;
      name: string;
      email: string;
      department: string | null;
      join_year: number | null;
    };
  }[];
  reviews: {
    id: number;
    title: string;
    status: "pending" | "in_progress" | "completed";
    created_at: string;
    user: {
      id: number;
      name: string;
    };
  }[];
}

export default function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAdmin = user?.role === "admin";

  // プロジェクト詳細を取得
  useEffect(() => {
    const fetchProject = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("プロジェクト情報の取得に失敗しました");
        }

        const data = await response.json();
        setProject(data.data);
      } catch (error) {
        console.error("プロジェクト詳細取得エラー:", error);
        toast({
          title: "エラー",
          description: "プロジェクト情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [params.id, token, toast]);

  // ステータスに応じたバッジを返す
  const getStatusBadge = (status: Project["status"]) => {
    switch (status) {
      case "planning":
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
            <PlaneLanding className="w-3 h-3 mr-1" /> 計画中
          </Badge>
        );
      case "active":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" /> 進行中
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">
            <Clock className="w-3 h-3 mr-1" /> 完了
          </Badge>
        );
      case "archived":
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">
            <ArchiveIcon className="w-3 h-3 mr-1" /> アーカイブ
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" /> 不明
          </Badge>
        );
    }
  };

  // 日付をフォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  // プロジェクトを削除
  const handleDeleteProject = async () => {
    if (!project || !isAdmin) return;

    const confirm = window.confirm(
      `プロジェクト「${project.name}」を削除しますか？この操作は元に戻せません。`
    );

    if (!confirm) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${project.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("プロジェクトの削除に失敗しました");
      }

      toast({
        title: "削除完了",
        description: "プロジェクトが削除されました",
      });

      router.push("/dashboard/projects");
    } catch (error) {
      console.error("プロジェクト削除エラー:", error);
      toast({
        title: "エラー",
        description: "プロジェクトの削除に失敗しました",
        variant: "destructive",
      });
    }
  };

  // メンバーの役割を表示
  const getRoleName = (role: string) => {
    switch (role) {
      case "leader":
        return "リーダー";
      case "member":
        return "メンバー";
      case "reviewer":
        return "レビュアー";
      case "observer":
        return "オブザーバー";
      default:
        return role;
    }
  };

  // レビューステータスのバッジを表示
  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">レビュー待ち</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-800">レビュー中</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800">完了</Badge>;
      default:
        return <Badge variant="outline">不明</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div
            className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full"
            role="status"
          >
            <span className="visually-hidden"></span>
          </div>
          <p className="mt-2">プロジェクト情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">プロジェクトが見つかりません</h2>
        <p className="mt-2 text-gray-500">
          指定されたプロジェクトは存在しないか、アクセス権がありません。
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/dashboard/projects")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> プロジェクト一覧に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/projects")}
          className="self-start"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 一覧に戻る
        </Button>
        {isAdmin && (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/dashboard/projects/${project.id}/edit`)
              }
            >
              <Edit className="mr-2 h-4 w-4" /> 編集
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteProject}
            >
              <Trash2 className="mr-2 h-4 w-4" /> 削除
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
            <div>
              <CardTitle className="text-2xl">{project.name}</CardTitle>
              <CardDescription className="mt-1">
                コード: {project.code}
              </CardDescription>
            </div>
            <div className="mt-2 sm:mt-0">{getStatusBadge(project.status)}</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-1">説明</h3>
            <p className="text-sm text-gray-600">
              {project.description || "説明はありません"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-1">開始日</h3>
              <p className="text-sm text-gray-600 flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {formatDate(project.start_date)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">終了日</h3>
              <p className="text-sm text-gray-600 flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {formatDate(project.end_date)}
              </p>
            </div>
          </div>

          {project.backlog_project_key && (
            <div>
              <h3 className="text-sm font-medium mb-1">Backlog連携</h3>
              <p className="text-sm text-gray-600 flex items-center">
                <GitBranch className="h-4 w-4 mr-1" />
                プロジェクトキー: {project.backlog_project_key}
              </p>
              {project.backlog_repository_names && (
                <p className="text-sm text-gray-600 mt-1 ml-5">
                  リポジトリ: {project.backlog_repository_names}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="members">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="flex items-center">
            <Users className="h-4 w-4 mr-2" /> メンバー (
            {project.userProjects?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center">
            <ClipboardList className="h-4 w-4 mr-2" /> レビュー (
            {project.reviews?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">プロジェクトメンバー</CardTitle>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() =>
                      router.push(`/dashboard/projects/${project.id}/members`)
                    }
                  >
                    <UserPlus className="h-4 w-4 mr-2" /> メンバー追加
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {project.userProjects && project.userProjects.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名前</TableHead>
                      <TableHead>メール</TableHead>
                      <TableHead>役割</TableHead>
                      <TableHead>部署</TableHead>
                      <TableHead>参加日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.userProjects.map((membership) => (
                      <TableRow key={membership.id}>
                        <TableCell className="font-medium">
                          {membership.user.name}
                        </TableCell>
                        <TableCell>{membership.user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getRoleName(membership.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {membership.user.department || "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(membership.joined_at).toLocaleDateString(
                            "ja-JP"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  メンバーがまだ登録されていません
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">
                  プロジェクトのレビュー
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() =>
                    router.push(`/dashboard/reviews/new?project=${project.id}`)
                  }
                >
                  <ClipboardList className="h-4 w-4 mr-2" /> 新規レビュー
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {project.reviews && project.reviews.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル</TableHead>
                      <TableHead>提出者</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>作成日</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.reviews.map((review) => (
                      <TableRow key={review.id}>
                        <TableCell className="font-medium">
                          {review.title}
                        </TableCell>
                        <TableCell>{review.user.name}</TableCell>
                        <TableCell>
                          {getReviewStatusBadge(review.status)}
                        </TableCell>
                        <TableCell>
                          {new Date(review.created_at).toLocaleDateString(
                            "ja-JP"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              router.push(`/dashboard/reviews/${review.id}`)
                            }
                          >
                            詳細
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  レビューがまだ登録されていません
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
