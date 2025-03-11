// frontend/src/app/dashboard/reviews/[id]/backlog/page.tsx
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  GitPullRequest,
  ChevronRight,
  Check,
  AlertCircle,
  Github,
  GitBranch,
  GitMerge,
  GitCommit,
} from "lucide-react";

interface Review {
  id: number;
  title: string;
  description?: string;
}

interface Project {
  id: number;
  projectKey: string;
  name: string;
}

interface Repository {
  id: number;
  name: string;
  description?: string;
}

export default function BacklogIntegrationPage({
  params,
}: {
  params: { id: string };
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isReposLoading, setIsReposLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    spaceKey?: string;
    error?: string;
  } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [baseBranch, setBaseBranch] = useState<string>("master");
  const [pullRequestUrl, setPullRequestUrl] = useState<string>("");
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // レビュー情報を取得
  useEffect(() => {
    const fetchReviewData = async () => {
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
          throw new Error("レビュー情報の取得に失敗しました");
        }

        const data = await response.json();
        setReview(data.data);
      } catch (error) {
        console.error("レビュー情報取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "レビュー情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    // Backlog接続ステータスを確認
    const checkBacklogStatus = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Backlog接続ステータスの取得に失敗しました");
        }

        const data = await response.json();
        setConnectionStatus(data.data);
      } catch (error) {
        console.error("Backlog接続ステータス確認エラー:", error);
        setConnectionStatus({
          connected: false,
          error: "接続確認中にエラーが発生しました",
        });
      } finally {
        setIsStatusLoading(false);
      }
    };

    if (token) {
      fetchReviewData();
      checkBacklogStatus();
    }
  }, [params.id, token, toast]);

  // プロジェクト一覧を取得
  const fetchProjects = async () => {
    try {
      setIsProjectsLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/projects`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("プロジェクト一覧の取得に失敗しました");
      }

      const data = await response.json();
      setProjects(data.data);
    } catch (error) {
      console.error("プロジェクト一覧取得エラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "プロジェクト一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsProjectsLoading(false);
    }
  };

  // リポジトリ一覧を取得
  const fetchRepositories = async (projectId: string) => {
    try {
      setIsReposLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/projects/${projectId}/repositories`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("リポジトリ一覧の取得に失敗しました");
      }

      const data = await response.json();
      setRepositories(data.data);
    } catch (error) {
      console.error("リポジトリ一覧取得エラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "リポジトリ一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsReposLoading(false);
    }
  };

  // プロジェクト選択時の処理
  useEffect(() => {
    if (selectedProjectId) {
      fetchRepositories(selectedProjectId);
      setSelectedRepoId("");
    }
  }, [selectedProjectId, token]);

  // プロジェクト一覧を初回読み込み
  useEffect(() => {
    if (connectionStatus?.connected) {
      fetchProjects();
    }
  }, [connectionStatus, token]);

  // プルリクエスト作成の処理
  const handleSubmit = async () => {
    if (!review || !selectedProjectId || !selectedRepoId) {
      toast({
        title: "入力エラー",
        description: "必要な情報をすべて入力してください",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/submit-changes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reviewId: review.id,
            projectId: selectedProjectId,
            repositoryId: selectedRepoId,
            baseBranch,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("プルリクエストの作成に失敗しました");
      }

      const data = await response.json();

      // プルリクエストのURLを設定（例: https://example.backlog.jp/git/PROJECT/REPO/pullRequests/123）
      const prUrl = `https://${connectionStatus?.spaceKey}.backlog.jp/git/${selectedProjectId}/${selectedRepoId}/pullRequests/${data.data.number}`;
      setPullRequestUrl(prUrl);

      toast({
        title: "プルリクエストが作成されました",
        description: "コード変更が正常に送信されました",
      });
    } catch (error) {
      console.error("プルリクエスト作成エラー:", error);
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error
            ? error.message
            : "プルリクエストの作成に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
            onClick={() => router.push(`/dashboard/reviews/${params.id}`)}
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
            <AlertCircle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
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
          <ChevronRight className="inline h-3 w-3" /> Backlog連携
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GitPullRequest className="h-5 w-5 mr-2" />
            Backlogへプルリクエストを作成
          </CardTitle>
          <CardDescription>
            コードレビューの修正内容をBacklogのリポジトリへ送信します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isStatusLoading ? (
            <div className="flex items-center space-x-4">
              <span>Backlog連携ステータスを確認中...</span>
              <div className="animate-spin h-4 w-4 border-2 border-primary rounded-full border-t-transparent"></div>
            </div>
          ) : connectionStatus?.connected ? (
            <Alert className="bg-green-50 border-green-200">
              <Check className="h-4 w-4 text-green-600" />
              <AlertTitle>接続中</AlertTitle>
              <AlertDescription>
                Backlog ({connectionStatus.spaceKey}.backlog.jp)
                に接続されています
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>接続エラー</AlertTitle>
              <AlertDescription>
                Backlogに接続できませんでした。
                {connectionStatus?.error && <p>{connectionStatus.error}</p>}
                <p className="mt-2">
                  管理者に連絡するか、APIキーの設定を確認してください。
                </p>
              </AlertDescription>
            </Alert>
          )}

          {connectionStatus?.connected && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  プロジェクト<span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                  disabled={isProjectsLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="プロジェクトを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.projectKey}>
                        {project.name} ({project.projectKey})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isProjectsLoading && (
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <div className="animate-spin h-3 w-3 border-2 border-primary rounded-full border-t-transparent"></div>
                    <span>プロジェクトを読み込み中...</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  リポジトリ<span className="text-red-500">*</span>
                </label>
                <Select
                  value={selectedRepoId}
                  onValueChange={setSelectedRepoId}
                  disabled={!selectedProjectId || isReposLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        selectedProjectId
                          ? "リポジトリを選択"
                          : "先にプロジェクトを選択してください"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((repo) => (
                      <SelectItem key={repo.id} value={repo.name}>
                        {repo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isReposLoading && (
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <div className="animate-spin h-3 w-3 border-2 border-primary rounded-full border-t-transparent"></div>
                    <span>リポジトリを読み込み中...</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">ベースブランチ</label>
                <Input
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  placeholder="master"
                />
                <p className="text-xs text-gray-500">
                  マージ先となるブランチ名（デフォルト: master）
                </p>
              </div>

              {pullRequestUrl && (
                <Alert className="bg-blue-50 border-blue-200">
                  <Check className="h-4 w-4 text-blue-600" />
                  <AlertTitle>プルリクエストが作成されました</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">
                      以下のURLからプルリクエストを確認できます：
                    </p>
                    <a
                      href={pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center"
                    >
                      <Github className="h-4 w-4 mr-1" />
                      {pullRequestUrl}
                    </a>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/reviews/${params.id}`)}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !connectionStatus?.connected ||
              !selectedProjectId ||
              !selectedRepoId ||
              isSubmitting
            }
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2"></div>
                送信中...
              </>
            ) : (
              <>
                <GitPullRequest className="mr-2 h-4 w-4" />
                プルリクエストを作成
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backlog連携について</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="bg-blue-100 p-2.5 rounded-full">
                <GitBranch className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">新しいブランチの作成</h3>
                <p className="text-sm text-gray-600">
                  レビューコードに基づいた新しいブランチが自動的に作成されます。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-green-100 p-2.5 rounded-full">
                <GitCommit className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">コードのコミット</h3>
                <p className="text-sm text-gray-600">
                  レビューで修正したコードが自動的にコミットされます。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-purple-100 p-2.5 rounded-full">
                <GitPullRequest className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">プルリクエスト作成</h3>
                <p className="text-sm text-gray-600">
                  ベースブランチに対するプルリクエストが自動的に作成され、レビュー情報が含まれます。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-amber-100 p-2.5 rounded-full">
                <GitMerge className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold">コードレビューとマージ</h3>
                <p className="text-sm text-gray-600">
                  チームメンバーがBacklog上でコードをレビューし、問題がなければマージできます。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
