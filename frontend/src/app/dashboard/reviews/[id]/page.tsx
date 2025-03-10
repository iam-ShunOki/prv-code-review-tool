// frontend/src/app/dashboard/reviews/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
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
import {
  ArrowLeft,
  Clock,
  Code,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

// Monaco Editor をクライアントサイドのみでロード
const MonacoEditor = dynamic(() => import("react-monaco-editor"), {
  ssr: false,
});

// レビューとコード提出の型定義
interface Review {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
  submissions: CodeSubmission[];
}

interface CodeSubmission {
  id: number;
  review_id: number;
  code_content: string;
  expectation: string | null;
  status: string; // 単純な文字列型
  version: number;
  created_at: string;
  feedbacks: Feedback[];
}

interface Feedback {
  id: number;
  submission_id: number;
  problem_point: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
  line_number: number | null;
  created_at: string;
}

export default function ReviewDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSubmission, setExpandedSubmission] = useState<number | null>(
    null
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 自動更新のためのトリガー
  const { user, token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const fetchReviewDetail = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/reviews/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("レビュー詳細の取得に失敗しました");
        }

        const data = await response.json();
        setReview(data.data);

        // 提出物があれば一覧を取得
        if (data.data) {
          const submissionsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/submissions/review/${params.id}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (submissionsResponse.ok) {
            const submissionsData = await submissionsResponse.json();

            // 取得したデータでレビュー情報を更新
            setReview((prev) => {
              if (!prev) return null;
              return { ...prev, submissions: submissionsData.data };
            });

            // レビュー待ちの提出があるか確認
            const hasSubmittedSubmissions = submissionsData.data.some(
              (sub: CodeSubmission) => sub.status === "submitted"
            );

            // レビュー待ちの場合は定期的にリフレッシュする
            if (hasSubmittedSubmissions) {
              setTimeout(() => setRefreshTrigger((prev) => prev + 1), 5000);
            }
          }
        }
      } catch (error) {
        console.error("レビュー詳細取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "レビュー詳細の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchReviewDetail();
    }
  }, [params.id, token, toast, refreshTrigger]);

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

  // 提出バージョンの表示を切り替える
  const toggleSubmission = (submissionId: number) => {
    if (expandedSubmission === submissionId) {
      setExpandedSubmission(null);
    } else {
      setExpandedSubmission(submissionId);
    }
  };

  // Monaco Editor の設定
  const editorOptions = {
    selectOnLineNumbers: true,
    readOnly: true,
    minimap: { enabled: true },
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div
            className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full"
            role="status"
          >
            <span className="visually-hidden">読み込み中...</span>
          </div>
          <p className="mt-2">レビュー詳細を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/reviews")}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
          </Button>
        </div>
        <Card className="text-center p-10">
          <CardContent>
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">レビューが見つかりません</h2>
            <p className="text-gray-500 mb-4">
              指定されたレビューは存在しないか、アクセス権限がありません。
            </p>
            <Button
              onClick={() => router.push("/dashboard/reviews")}
              className="mx-auto"
            >
              レビュー一覧に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/reviews")}
          className="mr-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
        </Button>
        <div className="text-sm text-gray-500">
          <Link href="/dashboard" className="hover:underline">
            ダッシュボード
          </Link>{" "}
          <ChevronRight className="inline h-3 w-3" />{" "}
          <Link href="/dashboard/reviews" className="hover:underline">
            レビュー一覧
          </Link>{" "}
          <ChevronRight className="inline h-3 w-3" /> {review.title}
        </div>
      </div>

      <Card>
        <CardHeader className="bg-gray-50">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{review.title}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                ID: {review.id} | 作成日: {formatDate(review.created_at)}
              </p>
            </div>
            {getStatusBadge(review.status)}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">説明</h3>
              <p className="text-gray-700">
                {review.description || "説明はありません"}
              </p>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">コード提出履歴</h3>

              {review.submissions && review.submissions.length > 0 ? (
                <div className="space-y-4">
                  {review.submissions.map((submission) => (
                    <Card key={submission.id} className="overflow-hidden">
                      <div
                        className="flex justify-between items-center p-4 cursor-pointer bg-gray-50"
                        onClick={() => toggleSubmission(submission.id)}
                      >
                        <div className="flex items-center">
                          <span className="font-medium">
                            バージョン {submission.version}
                          </span>
                          <span className="text-sm text-gray-500 ml-4">
                            {formatDate(submission.created_at)}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {submission.status === "reviewed" && (
                            <div className="flex items-center text-green-600 bg-green-100 px-2 py-1 rounded text-xs mr-3">
                              <CheckCircle className="w-3 h-3 mr-1" />{" "}
                              レビュー済み
                            </div>
                          )}
                          {expandedSubmission === submission.id ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </div>
                      </div>

                      {expandedSubmission === submission.id && (
                        <div className="p-4 border-t">
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2">
                                コード
                              </h4>
                              <div className="h-64 border rounded-md overflow-hidden">
                                <MonacoEditor
                                  width="100%"
                                  height="100%"
                                  language="javascript" // 言語は動的に判断できるとよい
                                  theme="vs-dark"
                                  value={submission.code_content}
                                  options={editorOptions}
                                />
                              </div>
                            </div>

                            {submission.expectation && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">
                                  期待する結果
                                </h4>
                                <div className="p-3 bg-gray-50 rounded-md">
                                  <p className="whitespace-pre-line text-sm">
                                    {submission.expectation}
                                  </p>
                                </div>
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-medium mb-2">
                                フィードバック
                              </h4>
                              {submission.feedbacks &&
                              submission.feedbacks.length > 0 ? (
                                <div className="space-y-3">
                                  {submission.feedbacks.map((feedback) => (
                                    <Card key={feedback.id} className="p-3">
                                      <div className="flex justify-between">
                                        <h5 className="font-medium">
                                          {feedback.problem_point}
                                        </h5>
                                        <div
                                          className={`text-xs px-2 py-1 rounded ${
                                            feedback.priority === "high"
                                              ? "bg-red-100 text-red-600"
                                              : feedback.priority === "medium"
                                              ? "bg-yellow-100 text-yellow-600"
                                              : "bg-blue-100 text-blue-600"
                                          }`}
                                        >
                                          {feedback.priority === "high"
                                            ? "高"
                                            : feedback.priority === "medium"
                                            ? "中"
                                            : "低"}
                                          優先度
                                        </div>
                                      </div>
                                      <p className="text-sm mt-2">
                                        {feedback.suggestion}
                                      </p>
                                      {feedback.line_number && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          {feedback.line_number}行目
                                        </p>
                                      )}
                                    </Card>
                                  ))}
                                </div>
                              ) : submission.status === "submitted" ? (
                                <div className="bg-gray-50 p-6 rounded-md text-center">
                                  <div className="animate-pulse flex flex-col items-center">
                                    <div className="rounded-full bg-blue-200 h-12 w-12 flex items-center justify-center mb-3">
                                      <Code className="h-6 w-6 text-blue-600" />
                                    </div>
                                    <p className="text-blue-600 font-medium">
                                      AIがレビュー中です...
                                    </p>
                                    <p className="text-gray-500 text-sm mt-2">
                                      しばらくお待ちください。レビュー結果は自動的に表示されます。
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-gray-50 p-6 rounded-md text-center">
                                  <p className="text-gray-500">
                                    フィードバックはまだありません
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 p-6 rounded-md text-center">
                  <p className="text-gray-500">コード提出履歴はありません</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-gray-50 flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/reviews")}
          >
            レビュー一覧に戻る
          </Button>
          <Button asChild>
            <Link href={`/dashboard/reviews/${review.id}/submit`}>
              修正版を提出
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
