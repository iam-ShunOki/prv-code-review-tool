// frontend/src/app/dashboard/projects/[id]/reviews/page.tsx
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  Search,
  Filter,
  Plus,
  Code,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  CalendarIcon,
  UserIcon,
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";

// プロジェクトの型定義
interface Project {
  id: number;
  name: string;
  code: string;
}

// レビューの型定義
interface Review {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
  user: {
    id: number;
    name: string;
  };
}

export default function ProjectReviewsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [userFilter, setUserFilter] = useState<number | "">("");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [projectMembers, setProjectMembers] = useState<
    { id: number; name: string }[]
  >([]);
  const itemsPerPage = 10;

  // プロジェクト情報とレビュー一覧を取得
  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // プロジェクト情報を取得
        const projectResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!projectResponse.ok) {
          throw new Error("プロジェクト情報の取得に失敗しました");
        }

        const projectData = await projectResponse.json();
        setProject(projectData.data);

        // プロジェクトメンバーを取得
        const membersResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}/members`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!membersResponse.ok) {
          throw new Error("メンバー情報の取得に失敗しました");
        }

        const membersData = await membersResponse.json();
        // メンバー情報を整形
        const members = membersData.data.map((member: any) => ({
          id: member.user.id,
          name: member.user.name,
        }));
        setProjectMembers(members);

        // プロジェクトに関連するレビュー一覧を取得
        const reviewsResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}/reviews`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!reviewsResponse.ok) {
          throw new Error("レビュー一覧の取得に失敗しました");
        }

        const reviewsData = await reviewsResponse.json();
        setReviews(reviewsData.data || []);
        setFilteredReviews(reviewsData.data || []);

        // ページネーション設定
        setTotalPages(
          Math.ceil((reviewsData.data || []).length / itemsPerPage)
        );
      } catch (error) {
        console.error("データ取得エラー:", error);
        toast({
          title: "エラー",
          description: "データの取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [params.id, token, toast]);

  // 検索とフィルタリング
  useEffect(() => {
    let filtered = [...reviews];

    // 検索クエリによるフィルタリング
    if (searchQuery) {
      filtered = filtered.filter(
        (review) =>
          review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (review.description &&
            review.description
              .toLowerCase()
              .includes(searchQuery.toLowerCase()))
      );
    }

    // ステータスによるフィルタリング
    if (statusFilter) {
      filtered = filtered.filter((review) => review.status === statusFilter);
    }

    // ユーザーによるフィルタリング
    if (userFilter) {
      filtered = filtered.filter((review) => review.user.id === userFilter);
    }

    // 日付によるフィルタリング
    if (dateFilter) {
      const targetDate = format(dateFilter, "yyyy-MM-dd");
      filtered = filtered.filter((review) =>
        review.created_at.startsWith(targetDate)
      );
    }

    // ソート処理
    switch (sortBy) {
      case "newest":
        filtered.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "oldest":
        filtered.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "updated":
        filtered.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        break;
      case "title":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    setFilteredReviews(filtered);
    setCurrentPage(1);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  }, [searchQuery, statusFilter, userFilter, dateFilter, sortBy, reviews]);

  // フィルターをリセット
  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setUserFilter("");
    setDateFilter(undefined);
  };

  // 現在のページのデータを取得
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReviews.slice(startIndex, endIndex);
  };

  // ステータスに応じたバッジを返す
  const getStatusBadge = (status: Review["status"]) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex items-center text-yellow-600 bg-yellow-100 px-2 py-1 rounded text-xs">
            <Clock className="w-3 h-3 mr-1" /> レビュー待ち
          </div>
        );
      case "in_progress":
        return (
          <div className="flex items-center text-blue-600 bg-blue-100 px-2 py-1 rounded text-xs">
            <Code className="w-3 h-3 mr-1" /> レビュー中
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center text-green-600 bg-green-100 px-2 py-1 rounded text-xs">
            <CheckCircle className="w-3 h-3 mr-1" /> 完了
          </div>
        );
      default:
        return (
          <div className="flex items-center text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs">
            <AlertCircle className="w-3 h-3 mr-1" /> 不明
          </div>
        );
    }
  };

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ページネーションリンクを生成
  const renderPaginationLinks = () => {
    const pageItems = [];

    // 最初のページへのリンク
    pageItems.push(
      <PaginationItem key="first">
        <PaginationLink
          isActive={currentPage === 1}
          onClick={() => setCurrentPage(1)}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    // 左の省略記号
    if (currentPage > 3) {
      pageItems.push(
        <PaginationItem key="ellipsis-left">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // 中間のページリンク
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      if (i === 1 || i === totalPages) continue;
      pageItems.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // 右の省略記号
    if (currentPage < totalPages - 2) {
      pageItems.push(
        <PaginationItem key="ellipsis-right">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // 最後のページへのリンク
    if (totalPages > 1) {
      pageItems.push(
        <PaginationItem key="last">
          <PaginationLink
            isActive={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return pageItems;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="mt-2">データを読み込み中...</p>
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
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/projects/${params.id}`)}
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {project.name} のレビュー一覧
            </h1>
            <p className="text-gray-500 mt-1">
              プロジェクトに関連するすべてのコードレビューと状況
            </p>
          </div>
        </div>
        <Button
          onClick={() =>
            router.push(`/dashboard/reviews/new?project=${project.id}`)
          }
          className="flex items-center"
        >
          <Plus className="mr-2 h-4 w-4" /> 新規レビュー
        </Button>
      </div>

      {/* 検索・フィルタリング・ソート機能 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="レビュータイトルや説明で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger>
                    <div className="flex items-center">
                      <Filter className="mr-2 h-4 w-4" />
                      <span>並び替え</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">新しい順</SelectItem>
                    <SelectItem value="oldest">古い順</SelectItem>
                    <SelectItem value="updated">更新日順</SelectItem>
                    <SelectItem value="title">タイトル順</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={resetFilters}>
                  リセット
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <div className="flex items-center">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="ステータス" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべてのステータス</SelectItem>
                  <SelectItem value="pending">レビュー待ち</SelectItem>
                  <SelectItem value="in_progress">レビュー中</SelectItem>
                  <SelectItem value="completed">完了</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={userFilter ? String(userFilter) : ""}
                onValueChange={(value) =>
                  setUserFilter(value ? Number(value) : "")
                }
              >
                <SelectTrigger>
                  <div className="flex items-center">
                    <UserIcon className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="メンバー" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべてのメンバー</SelectItem>
                  {projectMembers.map((member) => (
                    <SelectItem key={member.id} value={String(member.id)}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? (
                      format(dateFilter, "yyyy年MM月dd日", { locale: ja })
                    ) : (
                      <span>日付で絞り込み</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredReviews.length === 0 ? (
        <Card className="text-center p-10">
          <CardContent>
            <div className="space-y-4">
              {reviews.length === 0 ? (
                <p className="text-gray-500">レビューがまだありません</p>
              ) : (
                <p className="text-gray-500">
                  条件に一致するレビューがありません
                </p>
              )}
              <Button
                onClick={() =>
                  router.push(`/dashboard/reviews/new?project=${project.id}`)
                }
                className="flex items-center mx-auto"
              >
                <Plus className="mr-2 h-4 w-4" /> 新規レビューを作成する
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            {getCurrentPageData().map((review) => (
              <Card key={review.id} className="overflow-hidden">
                <CardHeader className="bg-gray-50 py-3 px-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-md">{review.title}</CardTitle>
                    {getStatusBadge(review.status)}
                  </div>
                </CardHeader>
                <CardContent className="py-4 px-4">
                  <p className="text-xs mt-2 text-gray-600 line-clamp-1">
                    {review.description || "説明はありません"}
                  </p>
                  <div className="mt-3 text-xs text-gray-500 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span>作成日: {formatDate(review.created_at)}</span>
                      <span className="flex items-center">
                        提出者: {review.user.name}
                      </span>
                    </div>
                    <Button
                      className="flex mt-2 sm:mt-0"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(`/dashboard/reviews/${review.id}`)
                      }
                    >
                      詳細を見る
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="mt-6">
              <Pagination>
                <PaginationContent>
                  {/* 前のページへのリンク */}
                  {currentPage > 1 && (
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(currentPage - 1)}
                      />
                    </PaginationItem>
                  )}

                  {/* ページ番号リンク */}
                  {renderPaginationLinks()}

                  {/* 次のページへのリンク */}
                  {currentPage < totalPages && (
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(currentPage + 1)}
                      />
                    </PaginationItem>
                  )}
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
