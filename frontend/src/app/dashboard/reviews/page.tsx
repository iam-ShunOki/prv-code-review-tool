"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // 追加
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // 追加
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus,
  Code,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  Briefcase,
  Folder, // Folderアイコンを追加
} from "lucide-react"; // アイコン追加
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

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
  project?: {
    id: number;
    name: string;
    code: string;
  };
}

// プロジェクトの型定義（追加）
interface Project {
  id: number;
  name: string;
  code: string;
}

export default function ReviewsPage() {
  const searchParams = useSearchParams();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<Review[]>([]); // 追加
  const [projects, setProjects] = useState<Project[]>([]); // 追加
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState(""); // 追加
  const [selectedProject, setSelectedProject] = useState<string>(""); // 追加
  const [selectedStatus, setSelectedStatus] = useState<string>(""); // 追加
  const itemsPerPage = 4; // 1ページあたりの表示数
  const { user, token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // URLからプロジェクトIDを取得（追加）
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (projectId) {
      setSelectedProject(projectId);
    }
  }, [searchParams]);

  // プロジェクト一覧の取得（追加）
  useEffect(() => {
    const fetchProjects = async () => {
      if (!token) return;

      try {
        const endpoint =
          user?.role === "admin"
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
        setProjects(data.data || []);
      } catch (error) {
        console.error("プロジェクト取得エラー:", error);
      }
    };

    fetchProjects();
  }, [token, user?.role]);

  // レビュー一覧を取得
  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/reviews`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("レビュー一覧の取得に失敗しました");
        }

        const data = await response.json();
        setReviews(data.data);

        // 初期表示時のフィルタリング（追加）
        filterReviews(data.data, searchQuery, selectedProject, selectedStatus);
      } catch (error) {
        console.error("レビュー一覧取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "レビュー一覧の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchReviews();
    }
  }, [token, toast]);

  // 検索・フィルタリング関数（追加）
  const filterReviews = (
    reviewList: Review[],
    query: string,
    projectId: string,
    status: string
  ) => {
    let filtered = [...reviewList];

    // タイトルまたは説明で検索
    if (query) {
      filtered = filtered.filter(
        (review) =>
          review.title.toLowerCase().includes(query.toLowerCase()) ||
          (review.description &&
            review.description.toLowerCase().includes(query.toLowerCase()))
      );
    }

    // プロジェクトでフィルタリング
    if (projectId) {
      filtered = filtered.filter(
        (review) => review.project && review.project.id === parseInt(projectId)
      );
    }

    // ステータスでフィルタリング
    if (status) {
      filtered = filtered.filter((review) => review.status === status);
    }

    setFilteredReviews(filtered);

    // ページネーションの更新
    setCurrentPage(1);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  };

  // 検索とフィルタリングを適用
  useEffect(() => {
    filterReviews(reviews, searchQuery, selectedProject, selectedStatus);
  }, [searchQuery, selectedProject, selectedStatus, reviews]);

  // ステータスに応じたバッジを返す関数
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

  // 日付をフォーマットする関数
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

  // 検索とフィルタをリセット（追加）
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedProject("");
    setSelectedStatus("");
  };

  // 現在のページのデータを取得
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReviews.slice(startIndex, endIndex);
  };

  // ページネーションリンクを生成する関数
  const renderPaginationLinks = () => {
    const pageItems = [];
    const maxDisplayedPages = 5; // 最大表示ページ数

    // 最初のページへのリンク（常に表示）
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

    // 左の省略記号（必要な場合）
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
      if (i === 1 || i === totalPages) continue; // 最初と最後のページは別に処理
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

    // 右の省略記号（必要な場合）
    if (currentPage < totalPages - 2) {
      pageItems.push(
        <PaginationItem key="ellipsis-right">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // 最後のページへのリンク（常に表示、ただし最初のページと同じ場合は非表示）
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
          <p className="mt-2">レビュー一覧を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">コードレビュー一覧</h1>
          <p className="text-gray-500 mt-1">
            これまでに依頼したすべてのコードレビューとその状況
          </p>
        </div>
        <Button
          onClick={() => router.push("/dashboard/reviews/new")}
          className="flex items-center"
        >
          <Plus className="mr-2 h-4 w-4" /> 新規レビュー
        </Button>
      </div>

      {/* 検索・フィルタリング機能（追加） */}
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
              <Select
                value={selectedProject}
                onValueChange={setSelectedProject}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center">
                    <Folder className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="プロジェクトで絞り込み" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべてのプロジェクト</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-1/4">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
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
                <p className="text-gray-500">レビュー依頼がまだありません</p>
              ) : (
                <p className="text-gray-500">
                  条件に一致するレビューがありません
                </p>
              )}
              <Button
                onClick={() => router.push("/dashboard/reviews/new")}
                className="flex items-center mx-auto"
              >
                <Plus className="mr-2 h-4 w-4" /> 新規レビューを依頼する
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            {getCurrentPageData().map((review) => (
              <Card key={review.id} className="overflow-hidden">
                <CardHeader className="bg-gray-50 py-2 px-4">
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
                      {review.project && (
                        <div className="flex items-center mt-1 sm:mt-0">
                          <Folder className="h-3 w-3 mr-1 text-gray-500" />
                          <span className="text-xs text-gray-600">
                            プロジェクト:
                            <Link
                              href={`/dashboard/projects/${review.project.id}`}
                              className="text-blue-600 hover:underline ml-1"
                            >
                              {review.project.name}
                            </Link>
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      className="flex mt-2 sm:mt-0"
                      variant="outline"
                      size="sm"
                    >
                      <Link href={`/dashboard/reviews/${review.id}`}>
                        詳細を見る
                      </Link>
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
