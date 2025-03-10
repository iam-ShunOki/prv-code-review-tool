// frontend/src/app/dashboard/reviews/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Code, Clock, CheckCircle, AlertCircle } from "lucide-react";

// レビューの型定義
interface Review {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div
            className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full"
            role="status"
          >
            {/* <span className="visually-hidden">読み込み中...</span> */}
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

      {reviews.length === 0 ? (
        <Card className="text-center p-10">
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-500">レビュー依頼がまだありません</p>
              <Button
                onClick={() => router.push("/dashboard/reviews/new")}
                className="flex items-center mx-auto"
              >
                <Plus className="mr-2 h-4 w-4" /> 最初のレビューを依頼する
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {reviews.map((review) => (
            <Card key={review.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50 pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{review.title}</CardTitle>
                  {getStatusBadge(review.status)}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-600 line-clamp-2">
                  {review.description || "説明はありません"}
                </p>
                <div className="mt-4 text-xs text-gray-500">
                  作成日: {formatDate(review.created_at)}
                </div>
              </CardContent>
              <CardFooter className="bg-gray-50 flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/reviews/${review.id}`}>
                    詳細を見る
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
