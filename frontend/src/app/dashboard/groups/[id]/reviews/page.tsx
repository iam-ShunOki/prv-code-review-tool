// frontend/src/app/dashboard/groups/[id]/reviews/page.tsx
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

// グループの型定義
interface Group {
  id: number;
  name: string;
  description: string;
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

export default function GroupReviewsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { token } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // グループ情報とレビュー一覧を取得
  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // グループ情報を取得
        const groupResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!groupResponse.ok) {
          throw new Error("グループ情報の取得に失敗しました");
        }

        const groupData = await groupResponse.json();
        setGroup(groupData.data);

        // グループに関連するレビュー一覧を取得
        const reviewsResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${params.id}/reviews`,
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

    setFilteredReviews(filtered);
    setCurrentPage(1);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  }, [searchQuery, statusFilter, reviews]);

  // フィルターをリセット
  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
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
          <div
            className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full"
            role="status"
          >
            <span className="visually-hidden"></span>
          </div>
          <p className="mt-2">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">グループが見つかりません</h2>
        <p className="mt-2 text-gray-500">
          指定されたグループは存在しないか、アクセス権がありません。
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/dashboard/groups")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> グループ一覧に戻る
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
            onClick={() => router.push(`/dashboard/groups/${params.id}`)}
            className="mr-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{group.name} のレビュー一覧</h1>
            <p className="text-gray-500 mt-1">
              グループに関連するすべてのコードレビューと状況
            </p>
          </div>
        </div>
        <Button
          onClick={() =>
            router.push(`/dashboard/reviews/new?group=${group.id}`)
          }
          className="flex items-center"
        >
          <Plus className="mr-2 h-4 w-4" /> 新規レビュー
        </Button>
      </div>

      {/* 検索・フィルタリング機能 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="レビュータイトルで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full md:w-1/4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
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
            </div>
            <Button
              variant="outline"
              onClick={resetFilters}
              className="md:self-start"
            >
              リセット
            </Button>
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
                  router.push(`/dashboard/reviews/new?group=${group.id}`)
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
                    >
                      <a href={`/dashboard/reviews/${review.id}`}>詳細を見る</a>
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
