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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  PlusCircle,
  Users,
  Calendar,
  GitBranch,
  ClipboardList,
  CheckCircle2,
  Clock,
  ArchiveIcon,
  PlaneLanding,
} from "lucide-react";
import Link from "next/link";

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
  userProjects?: { user: { name: string } }[];
  reviews?: any[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isAdmin = user?.role === "admin";

  // プロジェクト一覧を取得
  useEffect(() => {
    const fetchProjects = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // 管理者は全プロジェクト、それ以外は自分が関わるプロジェクトを取得
        const endpoint = isAdmin
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/projects/all`
          : `${process.env.NEXT_PUBLIC_API_URL}/api/projects/my`;

        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("プロジェクト一覧の取得に失敗しました");
        }

        const data = await response.json();
        const projectsData = data.data || [];

        // 各プロジェクトのメンバー数とレビュー数を取得して追加
        const enhancedProjects = await Promise.all(
          projectsData.map(async (project: Project) => {
            const projectWithDetails = { ...project };

            try {
              // メンバー情報を取得
              const membersResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${project.id}/members`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              if (membersResponse.ok) {
                const membersData = await membersResponse.json();
                projectWithDetails.userProjects = membersData.data || [];
              } else {
                projectWithDetails.userProjects = [];
              }

              // レビュー情報を取得
              const reviewsResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${project.id}/reviews`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              if (reviewsResponse.ok) {
                const reviewsData = await reviewsResponse.json();
                projectWithDetails.reviews = reviewsData.data || [];
              } else {
                projectWithDetails.reviews = [];
              }
            } catch (error) {
              console.error(
                `プロジェクト ${project.id} の詳細取得エラー:`,
                error
              );
              // エラーが発生した場合のデフォルト値
              if (!projectWithDetails.userProjects)
                projectWithDetails.userProjects = [];
              if (!projectWithDetails.reviews) projectWithDetails.reviews = [];
            }

            return projectWithDetails;
          })
        );

        setProjects(enhancedProjects);
      } catch (error) {
        console.error("プロジェクト取得エラー:", error);
        toast({
          title: "エラー",
          description: "プロジェクト一覧の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [token, isAdmin, toast]);

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

  // メンバー数を表示
  const getMemberCount = (project: Project) => {
    return project.userProjects?.length || 0;
  };

  // レビュー数を表示
  const getReviewCount = (project: Project) => {
    return project.reviews?.length || 0;
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">プロジェクト</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? "すべてのプロジェクトと進捗状況"
              : "参加しているプロジェクト"}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => router.push("/dashboard/projects/new")}
            className="flex items-center"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> 新規プロジェクト
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <Card className="text-center p-10">
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-500">
                {isAdmin
                  ? "プロジェクトがまだ登録されていません"
                  : "参加しているプロジェクトはありません"}
              </p>
              {isAdmin && (
                <Button
                  onClick={() => router.push("/dashboard/projects/new")}
                  className="flex items-center mx-auto"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />{" "}
                  最初のプロジェクトを作成
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50 py-3 px-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  {getStatusBadge(project.status)}
                </div>
                <CardDescription className="text-xs">
                  コード: {project.code}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm mb-4 line-clamp-2">
                  {project.description || "説明はありません"}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    開始: {formatDate(project.start_date)}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    終了: {formatDate(project.end_date)}
                  </div>
                  <div className="flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    メンバー: {getMemberCount(project)}人
                  </div>
                  <div className="flex items-center">
                    <ClipboardList className="h-3 w-3 mr-1" />
                    レビュー: {getReviewCount(project)}件
                  </div>
                </div>
                {project.backlog_project_key && (
                  <div className="mt-2 text-xs flex items-center text-gray-600">
                    <GitBranch className="h-3 w-3 mr-1" />
                    Backlog: {project.backlog_project_key}
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-gray-50 p-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(`/dashboard/projects/${project.id}`)
                  }
                >
                  詳細を見る
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
