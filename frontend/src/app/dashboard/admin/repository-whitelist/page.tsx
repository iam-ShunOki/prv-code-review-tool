// frontend/src/app/dashboard/admin/repository-whitelist/page.tsx
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { PlusCircle, Trash2, Check, X, AlertCircle, Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface Repository {
  projectKey: string;
  repositoryName: string;
  allowAutoReply: boolean;
  notes?: string;
  addedAt: string;
}

interface Project {
  projectKey: string;
  name: string;
}

export default function RepositoryWhitelistPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 新規リポジトリ追加用のフォーム状態
  const [newRepo, setNewRepo] = useState({
    projectKey: "",
    repositoryName: "",
    allowAutoReply: true,
    notes: "",
  });

  // プロジェクトによってフィルタリングされたリポジトリ候補
  const [availableRepos, setAvailableRepos] = useState<{ name: string }[]>([]);

  // 管理者のみアクセス可能
  useEffect(() => {
    if (user && user.role !== "admin") {
      toast({
        title: "権限エラー",
        description: "管理者専用ページです",
        variant: "destructive",
      });
      router.push("/dashboard");
    }
  }, [user, router, toast]);

  // データ読み込み
  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // プロジェクト一覧を取得
        const projectsResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/projects`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!projectsResponse.ok) {
          throw new Error("プロジェクト一覧の取得に失敗しました");
        }

        const projectsData = await projectsResponse.json();
        setProjects(projectsData.data || []);

        // ホワイトリスト一覧を取得
        const whitelistResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/admin/repository-whitelist`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!whitelistResponse.ok) {
          throw new Error("ホワイトリスト一覧の取得に失敗しました");
        }

        const whitelistData = await whitelistResponse.json();
        setRepositories(whitelistData.data || []);
      } catch (error) {
        console.error("データ取得エラー:", error);
        toast({
          title: "データ取得エラー",
          description: "リポジトリ情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [token, toast]);

  // プロジェクトが選択されたら、そのリポジトリ一覧を取得
  const handleProjectChange = async (projectKey: string) => {
    setNewRepo({ ...newRepo, projectKey, repositoryName: "" });

    if (!projectKey) {
      setAvailableRepos([]);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/projects/${projectKey}/repositories`,
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
      setAvailableRepos(data.data || []);
    } catch (error) {
      console.error("リポジトリ取得エラー:", error);
      toast({
        title: "エラー",
        description: "リポジトリ一覧の取得に失敗しました",
        variant: "destructive",
      });
      setAvailableRepos([]);
    }
  };

  // リポジトリをホワイトリストに追加
  const handleAddRepository = async () => {
    if (!newRepo.projectKey || !newRepo.repositoryName) {
      toast({
        title: "入力エラー",
        description: "プロジェクトとリポジトリを選択してください",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/repository-whitelist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newRepo),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "リポジトリの追加に失敗しました");
      }

      const data = await response.json();

      // 成功したら一覧を更新
      setRepositories((prev) => [...prev, data.data]);

      toast({
        title: "追加完了",
        description: "リポジトリをホワイトリストに追加しました",
      });

      // フォームをリセット
      setNewRepo({
        projectKey: "",
        repositoryName: "",
        allowAutoReply: true,
        notes: "",
      });
      setIsAddingRepo(false);
    } catch (error) {
      console.error("リポジトリ追加エラー:", error);
      toast({
        title: "追加エラー",
        description:
          error instanceof Error
            ? error.message
            : "リポジトリの追加に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 自動返信設定を切り替え
  const handleToggleAutoReply = async (repo: Repository, newValue: boolean) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/repository-whitelist/auto-reply`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectKey: repo.projectKey,
            repositoryName: repo.repositoryName,
            allowAutoReply: newValue,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("自動返信設定の更新に失敗しました");
      }

      // 成功したら一覧を更新
      setRepositories((prev) =>
        prev.map((r) =>
          r.projectKey === repo.projectKey &&
          r.repositoryName === repo.repositoryName
            ? { ...r, allowAutoReply: newValue }
            : r
        )
      );

      toast({
        title: "設定更新",
        description: `自動返信を${newValue ? "有効" : "無効"}にしました`,
      });
    } catch (error) {
      console.error("設定更新エラー:", error);
      toast({
        title: "更新エラー",
        description: "自動返信設定の更新に失敗しました",
        variant: "destructive",
      });
    }
  };

  // リポジトリをホワイトリストから削除
  const handleRemoveRepository = async (repo: Repository) => {
    if (
      !confirm(
        `リポジトリ ${repo.projectKey}/${repo.repositoryName} をホワイトリストから削除しますか？`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/repository-whitelist/${repo.projectKey}/${repo.repositoryName}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("リポジトリの削除に失敗しました");
      }

      // 成功したら一覧から削除
      setRepositories((prev) =>
        prev.filter(
          (r) =>
            !(
              r.projectKey === repo.projectKey &&
              r.repositoryName === repo.repositoryName
            )
        )
      );

      toast({
        title: "削除完了",
        description: "リポジトリをホワイトリストから削除しました",
      });
    } catch (error) {
      console.error("リポジトリ削除エラー:", error);
      toast({
        title: "削除エラー",
        description: "リポジトリの削除に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 管理者でない場合はアクセスできない
  if (user && user.role !== "admin") {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>アクセス権限エラー</AlertTitle>
          <AlertDescription>
            このページは管理者専用です。ダッシュボードに戻ります。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">リポジトリホワイトリスト管理</h1>
        <p className="text-gray-500 mt-1">
          自動レビュー結果の返信先リポジトリを管理します。ホワイトリストに登録されたリポジトリのみに自動返信されます。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>ホワイトリスト登録済みリポジトリ</CardTitle>
            <Button
              onClick={() => setIsAddingRepo(true)}
              disabled={isAddingRepo}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              リポジトリを追加
            </Button>
          </div>
          <CardDescription>
            自動返信を有効にしたリポジトリでは、AIレビュー完了時に自動的にBacklogプルリクエストへコメントが投稿されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAddingRepo && (
            <div className="bg-muted p-4 rounded-md mb-4">
              <h3 className="font-semibold mb-3">リポジトリを追加</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    プロジェクト
                  </label>
                  <Select
                    value={newRepo.projectKey}
                    onValueChange={handleProjectChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="プロジェクトを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem
                          key={project.projectKey}
                          value={project.projectKey}
                        >
                          {project.name} ({project.projectKey})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    リポジトリ
                  </label>
                  <Select
                    value={newRepo.repositoryName}
                    onValueChange={(value) =>
                      setNewRepo({ ...newRepo, repositoryName: value })
                    }
                    disabled={!newRepo.projectKey}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          newRepo.projectKey
                            ? "リポジトリを選択"
                            : "先にプロジェクトを選択してください"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRepos.map((repo) => (
                        <SelectItem key={repo.name} value={repo.name}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium mb-1 block">
                  メモ (任意)
                </label>
                <Input
                  value={newRepo.notes}
                  onChange={(e) =>
                    setNewRepo({ ...newRepo, notes: e.target.value })
                  }
                  placeholder="メモ"
                />
              </div>
              <div className="flex items-center mb-4">
                <Switch
                  checked={newRepo.allowAutoReply}
                  onCheckedChange={(checked) =>
                    setNewRepo({ ...newRepo, allowAutoReply: checked })
                  }
                  id="auto-reply"
                />
                <label htmlFor="auto-reply" className="ml-2 cursor-pointer">
                  自動返信を有効にする
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsAddingRepo(false)}
                >
                  <X className="mr-2 h-4 w-4" />
                  キャンセル
                </Button>
                <Button onClick={handleAddRepository}>
                  <Check className="mr-2 h-4 w-4" />
                  追加
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : repositories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>登録されているリポジトリはありません</p>
              <Button
                onClick={() => setIsAddingRepo(true)}
                variant="outline"
                className="mt-4"
              >
                リポジトリを追加
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>プロジェクト</TableHead>
                    <TableHead>リポジトリ名</TableHead>
                    <TableHead>自動返信</TableHead>
                    <TableHead>追加日時</TableHead>
                    <TableHead>メモ</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repositories.map((repo) => (
                    <TableRow key={`${repo.projectKey}-${repo.repositoryName}`}>
                      <TableCell className="font-medium">
                        {repo.projectKey}
                      </TableCell>
                      <TableCell>{repo.repositoryName}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Switch
                            checked={repo.allowAutoReply}
                            onCheckedChange={(checked) =>
                              handleToggleAutoReply(repo, checked)
                            }
                          />
                          <span className="ml-2">
                            {repo.allowAutoReply ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                                有効
                              </Badge>
                            ) : (
                              <Badge variant="secondary">無効</Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(repo.addedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{repo.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRepository(repo)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>設定について</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-medium flex items-center">
              <Info className="h-5 w-5 text-blue-500 mr-2" />
              自動返信設定について
            </h3>
            <p className="mt-1 text-gray-600">
              自動返信を有効にしたリポジトリでは、レビュー完了時に自動的にBacklogプルリクエストへコメントが投稿されます。
              無効にした場合は、管理者が手動で返信する必要があります。
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium flex items-center">
              <Info className="h-5 w-5 text-blue-500 mr-2" />
              リポジトリの追加手順
            </h3>
            <ol className="mt-1 text-gray-600 space-y-1 ml-5 list-decimal">
              <li>「リポジトリを追加」ボタンをクリック</li>
              <li>プロジェクトとリポジトリを選択</li>
              <li>必要に応じてメモを入力</li>
              <li>自動返信の有効/無効を設定</li>
              <li>「追加」ボタンをクリック</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
