// frontend/src/app/dashboard/reviews/[id]/submit/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackList } from "@/components/feedback/feedback-list";
import { FeedbackProgressTracker } from "@/components/feedback/feedback-progress-tracker";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  ChevronRight,
  Code,
  FileText,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

// Monaco Editor をクライアントサイドのみでロード
const MonacoEditor = dynamic(() => import("react-monaco-editor"), {
  ssr: false,
});

// レビューとコード提出の型定義
interface Review {
  id: number;
  title: string;
  submissions: CodeSubmission[];
}

interface CodeSubmission {
  id: number;
  code_content: string;
  expectation: string | null;
  version: number;
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

// ローカルストレージのキー
const getResolvedFeedbacksKey = (reviewId: string) =>
  `resolved_feedbacks_${reviewId}`;

export default function SubmitRevisionPage({
  params,
}: {
  params: { id: string };
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [latestSubmission, setLatestSubmission] =
    useState<CodeSubmission | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [code, setCode] = useState<string>("");
  const [expectation, setExpectation] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedFeedbacks, setResolvedFeedbacks] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState("code");
  const { token, user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // 管理者かどうかを判定
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const fetchReviewAndSubmissions = async () => {
      try {
        // レビュー情報を取得
        const reviewResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/reviews/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!reviewResponse.ok) {
          throw new Error("レビュー情報の取得に失敗しました");
        }

        const reviewData = await reviewResponse.json();
        setReview(reviewData.data);

        // コード提出一覧を取得
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

          // 最新のコード提出を取得
          const submissions = submissionsData.data;
          if (submissions && submissions.length > 0) {
            // バージョン番号で降順ソート
            const sorted = [...submissions].sort(
              (a, b) => b.version - a.version
            );
            const latest = sorted[0];
            setLatestSubmission(latest);
            setCode(latest.code_content);
            setExpectation(latest.expectation || "");

            // フィードバックを設定
            if (latest.feedbacks && latest.feedbacks.length > 0) {
              setFeedbacks(latest.feedbacks);
            }
          }
        }

        // ローカルストレージから解決済みフィードバックのIDを取得
        const storedResolvedFeedbacks = localStorage.getItem(
          getResolvedFeedbacksKey(params.id)
        );
        if (storedResolvedFeedbacks) {
          setResolvedFeedbacks(JSON.parse(storedResolvedFeedbacks));
        }
      } catch (error) {
        console.error("データ取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "レビュー情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchReviewAndSubmissions();
    }
  }, [params.id, token, toast]);

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast({
        title: "コードが必要です",
        description: "レビュー対象のコードを入力してください",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const submissionResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/submissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            review_id: parseInt(params.id),
            code_content: code,
            expectation: expectation || undefined,
          }),
        }
      );

      if (!submissionResponse.ok) {
        throw new Error("コード提出に失敗しました");
      }

      toast({
        title: "修正版を提出しました",
        description: "AIによるレビュー結果をお待ちください",
      });

      // レビュー詳細ページに戻る
      router.push(`/dashboard/reviews/${params.id}`);
    } catch (error) {
      console.error("コード提出エラー:", error);
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error ? error.message : "コード提出に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // フィードバックの解決状態を切り替える
  const handleMarkResolved = (feedbackId: number, resolved: boolean) => {
    let updatedResolvedFeedbacks;

    if (resolved) {
      // 解決済みリストに追加
      updatedResolvedFeedbacks = [...resolvedFeedbacks, feedbackId];
    } else {
      // 解決済みリストから削除
      updatedResolvedFeedbacks = resolvedFeedbacks.filter(
        (id) => id !== feedbackId
      );
    }

    setResolvedFeedbacks(updatedResolvedFeedbacks);

    // ローカルストレージに保存
    localStorage.setItem(
      getResolvedFeedbacksKey(params.id),
      JSON.stringify(updatedResolvedFeedbacks)
    );
  };

  // Monaco Editor の設定
  const editorOptions = {
    selectOnLineNumbers: true,
    roundedSelection: false,
    readOnly: false,
    cursorStyle: "line" as "line",
    automaticLayout: true,
    minimap: { enabled: true },
  };

  // 未対応フィードバックの数を取得
  const getUnresolvedCount = () => {
    return feedbacks.filter(
      (feedback) => !resolvedFeedbacks.includes(feedback.id)
    ).length;
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
          <p className="mt-2">情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/reviews")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
        </Button>
        <Card className="text-center p-10">
          <CardContent>
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
          onClick={() => router.push(`/dashboard/reviews/${params.id}`)}
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
          <ChevronRight className="inline h-3 w-3" />{" "}
          <Link
            href={`/dashboard/reviews/${params.id}`}
            className="hover:underline"
          >
            {review.title}
          </Link>{" "}
          <ChevronRight className="inline h-3 w-3" /> 修正版提出
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>修正版コードの提出</CardTitle>
          <CardDescription>
            フィードバックを確認しながらコードを修正して再提出できます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full md:w-[400px] grid-cols-2">
              <TabsTrigger value="code" className="flex items-center">
                <Code className="h-4 w-4 mr-2" />
                コード編集
              </TabsTrigger>
              <TabsTrigger value="feedback" className="flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                フィードバック
                {feedbacks.length > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                    {getUnresolvedCount()}/{feedbacks.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="space-y-4 mt-4">
              <div>
                <h3 className="text-sm font-medium mb-2">
                  コード（バージョン{" "}
                  {latestSubmission?.version ? latestSubmission.version + 1 : 1}
                  ）
                </h3>
                <div className="h-96 border rounded-md overflow-hidden">
                  <MonacoEditor
                    width="100%"
                    height="100%"
                    language="javascript" // デフォルト言語、言語選択機能を後で追加
                    theme="vs-dark"
                    value={code}
                    options={editorOptions}
                    onChange={setCode}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">
                  期待する結果（任意）
                </h3>
                <Textarea
                  value={expectation}
                  onChange={(e) => setExpectation(e.target.value)}
                  placeholder="コードに期待する動作や結果、修正した点など"
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="feedback" className="space-y-4 mt-4">
              <div className="space-y-4">
                <h3 className="text-sm font-medium">前回のフィードバック</h3>

                {feedbacks.length > 0 && (
                  <FeedbackProgressTracker
                    totalCount={feedbacks.length}
                    resolvedCount={resolvedFeedbacks.length}
                  />
                )}

                {feedbacks.length === 0 ? (
                  <div className="bg-gray-50 p-6 rounded-md text-center">
                    <p className="text-gray-500">フィードバックはありません</p>
                  </div>
                ) : (
                  <div className="border rounded-md p-4 bg-gray-50">
                    <FeedbackList
                      feedbacks={feedbacks}
                      onMarkResolved={handleMarkResolved}
                      resolvedFeedbacks={resolvedFeedbacks}
                      showResolved={true}
                    />
                  </div>
                )}

                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">
                    修正が完了したら「コード編集」タブに切り替えて、修正版を確認・提出してください。
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/reviews/${params.id}`)}
          >
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "送信中..." : "修正版を提出"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
