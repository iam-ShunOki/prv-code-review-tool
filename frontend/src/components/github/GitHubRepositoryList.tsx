// frontend/src/components/github/GitHubRepositoryList.tsx
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  GitFork,
  Plus,
  Trash2,
  RefreshCw,
  Edit,
  Check,
  X,
  ExternalLink,
  Key,
  ShieldAlert,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";

// リポジトリの型定義
interface GitHubRepository {
  id: number;
  owner: string;
  name: string;
  access_token: string;
  webhook_secret: string | null;
  is_active: boolean;
  allow_auto_review: boolean;
  created_at: string;
  updated_at: string;
}

// リポジトリフォームの値の型定義
interface RepositoryFormValues {
  owner: string;
  name: string;
  access_token: string;
  webhook_secret: string;
  is_active: boolean;
  allow_auto_review: boolean;
}

export function GitHubRepositoryList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 認証コンテキストからトークンを取得
  const { token } = useAuth();

  // API関数
  const fetchGitHubRepositories = async (): Promise<GitHubRepository[]> => {
    if (!token) {
      throw new Error("認証されていません");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/github/repositories`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "リポジトリの取得に失敗しました");
    }

    const data = await response.json();
    return data.data;
  };

  const validateRepository = async (values: {
    owner: string;
    name: string;
    access_token: string;
  }): Promise<any> => {
    if (!token) {
      throw new Error("認証されていません");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/github/validate-repository`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "リポジトリの検証に失敗しました");
    }

    return response.json();
  };

  const createRepository = async (
    values: RepositoryFormValues
  ): Promise<any> => {
    if (!token) {
      throw new Error("認証されていません");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/github/repositories`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "リポジトリの作成に失敗しました");
    }

    return response.json();
  };

  const updateRepository = async ({
    id,
    ...values
  }: RepositoryFormValues & { id: number }): Promise<any> => {
    if (!token) {
      throw new Error("認証されていません");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/github/repositories/${id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "リポジトリの更新に失敗しました");
    }

    return response.json();
  };

  const deleteRepository = async (id: number): Promise<any> => {
    if (!token) {
      throw new Error("認証されていません");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/github/repositories/${id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "リポジトリの削除に失敗しました");
    }

    return response.json();
  };

  // リポジトリ一覧を取得
  const {
    data: repositories,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["githubRepositories", token],
    queryFn: fetchGitHubRepositories,
    enabled: !!token, // トークンがある場合のみクエリを実行
  });

  // モーダル関連の状態
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRepository, setSelectedRepository] =
    useState<GitHubRepository | null>(null);

  // フォーム値の初期状態
  const initialFormValues: RepositoryFormValues = {
    owner: "",
    name: "",
    access_token: "",
    webhook_secret: "",
    is_active: true,
    allow_auto_review: true,
  };

  // フォームの値とバリデーション状態
  const [formValues, setFormValues] =
    useState<RepositoryFormValues>(initialFormValues);
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<any | null>(null);

  // リポジトリを作成するMutation
  const createMutation = useMutation({
    mutationFn: createRepository,
    onSuccess: () => {
      toast({
        title: "リポジトリを登録しました",
        description: `${formValues.owner}/${formValues.name} が正常に登録されました`,
      });
      setIsAddDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["githubRepositories"] });
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "リポジトリの登録に失敗しました",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // リポジトリを更新するMutation
  const updateMutation = useMutation({
    mutationFn: updateRepository,
    onSuccess: () => {
      toast({
        title: "リポジトリを更新しました",
        description: selectedRepository
          ? `${selectedRepository.owner}/${selectedRepository.name} が正常に更新されました`
          : "",
      });
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["githubRepositories"] });
    },
    onError: (error: Error) => {
      toast({
        title: "リポジトリの更新に失敗しました",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // リポジトリを削除するMutation
  const deleteMutation = useMutation({
    mutationFn: deleteRepository,
    onSuccess: () => {
      toast({
        title: "リポジトリを削除しました",
        description: selectedRepository
          ? `${selectedRepository.owner}/${selectedRepository.name} が正常に削除されました`
          : "",
      });
      queryClient.invalidateQueries({ queryKey: ["githubRepositories"] });
    },
    onError: (error: Error) => {
      toast({
        title: "リポジトリの削除に失敗しました",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // フォームの入力値をリセット
  const resetForm = () => {
    setFormValues(initialFormValues);
    setIsValidated(false);
    setValidationError(null);
    setValidationResult(null);
  };

  // 編集モーダルを開く
  const openEditDialog = (repository: GitHubRepository) => {
    setSelectedRepository(repository);
    setFormValues({
      owner: repository.owner,
      name: repository.name,
      access_token: repository.access_token || "",
      webhook_secret: repository.webhook_secret || "",
      is_active: repository.is_active,
      allow_auto_review: repository.allow_auto_review,
    });
    setIsEditDialogOpen(true);
  };

  // フォーム入力値の変更を処理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // 重要フィールドが変更されたらバリデーション結果をリセット
    if (["owner", "name", "access_token"].includes(name)) {
      setIsValidated(false);
      setValidationError(null);
      setValidationResult(null);
    }
  };

  // スイッチの変更を処理
  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormValues((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  // リポジトリを検証
  const validateRepositoryHandler = async () => {
    // 必須フィールドの検証
    if (!formValues.owner.trim()) {
      setValidationError("オーナー名を入力してください");
      return;
    }
    if (!formValues.name.trim()) {
      setValidationError("リポジトリ名を入力してください");
      return;
    }
    if (!formValues.access_token.trim()) {
      setValidationError("アクセストークンを入力してください");
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const result = await validateRepository({
        owner: formValues.owner,
        name: formValues.name,
        access_token: formValues.access_token,
      });

      setValidationResult(result.data);
      setIsValidated(true);

      toast({
        title: "リポジトリの検証が成功しました",
        description: `${formValues.owner}/${formValues.name} が正常に検証されました`,
      });
    } catch (error) {
      setValidationError(
        error instanceof Error
          ? error.message
          : "リポジトリの検証に失敗しました"
      );
      setIsValidated(false);
    } finally {
      setIsValidating(false);
    }
  };

  // リポジトリを送信（作成または更新）
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 新規作成時は検証が必要
    if (!isEditDialogOpen && !isValidated) {
      setValidationError("最初にリポジトリを検証してください");
      return;
    }

    if (isEditDialogOpen && selectedRepository) {
      // 更新の場合
      updateMutation.mutate({
        id: selectedRepository.id,
        ...formValues,
      });
    } else {
      // 新規作成の場合
      createMutation.mutate(formValues);
    }
  };

  // 削除確認
  const handleDelete = () => {
    if (selectedRepository) {
      deleteMutation.mutate(selectedRepository.id);
    }
  };

  // ダイアログを閉じる際のリセット処理
  useEffect(() => {
    if (!isAddDialogOpen && !isEditDialogOpen) {
      resetForm();
    }
  }, [isAddDialogOpen, isEditDialogOpen]);

  // 認証エラーチェック
  if (!token) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        <div className="flex">
          <ShieldAlert className="h-5 w-5 mr-2 flex-shrink-0" />
          <div>
            <h3 className="font-medium">認証エラー</h3>
            <p className="text-sm">
              ログインセッションが無効または期限切れです。再ログインしてください。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
        <span className="ml-2">リポジトリを読み込み中...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-destructive/15 p-4 text-destructive">
        <div className="flex">
          <ShieldAlert className="h-5 w-5 mr-2 flex-shrink-0" />
          <div>
            <h3 className="font-medium">エラーが発生しました</h3>
            <p className="text-sm">
              {error instanceof Error
                ? error.message
                : "リポジトリの取得中にエラーが発生しました"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              再読み込み
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <GitFork className="h-5 w-5 mr-2" />
          GitHubリポジトリ管理
        </CardTitle>
        <CardDescription>
          監視および自動レビューを行うGitHubリポジトリを管理します
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex gap-1">
                  <Plus size={16} />
                  リポジトリを追加
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                  <DialogTitle>GitHubリポジトリの追加</DialogTitle>
                  <DialogDescription>
                    監視および自動レビューを行うGitHubリポジトリを登録します。
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="owner">
                          オーナー名 <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="owner"
                          name="owner"
                          placeholder="例: octocat"
                          value={formValues.owner}
                          onChange={handleInputChange}
                          disabled={isValidated || isValidating}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          リポジトリ名{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="例: hello-world"
                          value={formValues.name}
                          onChange={handleInputChange}
                          disabled={isValidated || isValidating}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="access_token">
                        アクセストークン{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="access_token"
                        name="access_token"
                        type="password"
                        placeholder="GitHub Personal Access Token"
                        value={formValues.access_token}
                        onChange={handleInputChange}
                        disabled={isValidated || isValidating}
                      />
                      <p className="text-sm text-muted-foreground">
                        リポジトリへのアクセス権を持つGitHub Personal Access
                        Tokenを入力してください。
                      </p>
                    </div>

                    {!isValidated && !isValidating && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={validateRepositoryHandler}
                        className="w-full"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        リポジトリを検証
                      </Button>
                    )}

                    {isValidating && (
                      <div className="flex justify-center items-center p-4">
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">検証中...</span>
                      </div>
                    )}

                    {validationError && (
                      <div className="p-3 rounded-md bg-destructive/15 text-destructive text-sm">
                        <X className="inline w-4 h-4 mr-1" />
                        {validationError}
                      </div>
                    )}

                    {isValidated && validationResult && (
                      <div className="p-3 rounded-md bg-green-100 text-green-800 text-sm">
                        <Check className="inline w-4 h-4 mr-1" />
                        リポジトリを検証できました: {validationResult.full_name}
                        <div className="mt-1 text-xs">
                          {validationResult.description && (
                            <p>説明: {validationResult.description}</p>
                          )}
                          <p>
                            デフォルトブランチ:{" "}
                            {validationResult.default_branch}
                          </p>
                          <p>可視性: {validationResult.visibility}</p>
                        </div>
                      </div>
                    )}

                    {isValidated && (
                      <>
                        <Separator />

                        <div className="space-y-2">
                          <Label htmlFor="webhook_secret">Webhook Secret</Label>
                          <Input
                            id="webhook_secret"
                            name="webhook_secret"
                            type="password"
                            placeholder="オプション: Webhook Secret"
                            value={formValues.webhook_secret}
                            onChange={handleInputChange}
                          />
                          <p className="text-sm text-muted-foreground">
                            Webhookで使用するシークレットキーを設定できます。
                          </p>
                        </div>

                        <div className="flex items-center justify-between space-y-0 rounded-md border p-3">
                          <div className="space-y-0.5">
                            <Label htmlFor="is_active">有効にする</Label>
                            <p className="text-sm text-muted-foreground">
                              リポジトリを監視対象にします
                            </p>
                          </div>
                          <Switch
                            id="is_active"
                            name="is_active"
                            checked={formValues.is_active}
                            onCheckedChange={(checked) =>
                              handleSwitchChange("is_active", checked)
                            }
                          />
                        </div>

                        <div className="flex items-center justify-between space-y-0 rounded-md border p-3">
                          <div className="space-y-0.5">
                            <Label htmlFor="allow_auto_review">
                              自動レビューを許可
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              PRで@codeviewメンションがあった場合に自動レビューを実行します
                            </p>
                          </div>
                          <Switch
                            id="allow_auto_review"
                            name="allow_auto_review"
                            checked={formValues.allow_auto_review}
                            onCheckedChange={(checked) =>
                              handleSwitchChange("allow_auto_review", checked)
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      キャンセル
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        !isValidated || createMutation.status === "loading"
                      }
                    >
                      {createMutation.status === "loading" && (
                        <LoadingSpinner size="sm" className="mr-2" />
                      )}
                      登録する
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* 編集ダイアログ */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>GitHubリポジトリを編集</DialogTitle>
                <DialogDescription>
                  {selectedRepository
                    ? `${selectedRepository.owner}/${selectedRepository.name}`
                    : ""}{" "}
                  の設定を編集します。
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="border p-3 rounded-md bg-muted/40">
                    <p className="font-medium mb-1">リポジトリ情報</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold">
                        {selectedRepository?.owner}/
                      </span>
                      <span className="font-semibold">
                        {selectedRepository?.name}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="access_token">アクセストークン</Label>
                    <Input
                      id="access_token"
                      name="access_token"
                      type="password"
                      placeholder="変更する場合のみ入力"
                      value={formValues.access_token || ""}
                      onChange={handleInputChange}
                    />
                    <p className="text-sm text-muted-foreground">
                      変更する場合のみ新しいトークンを入力してください。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="webhook_secret">Webhook Secret</Label>
                    <Input
                      id="webhook_secret"
                      name="webhook_secret"
                      type="password"
                      placeholder="変更する場合のみ入力"
                      value={formValues.webhook_secret || ""}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="flex items-center justify-between space-y-0 rounded-md border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_active">有効にする</Label>
                      <p className="text-sm text-muted-foreground">
                        リポジトリを監視対象にします
                      </p>
                    </div>
                    <Switch
                      id="is_active"
                      name="is_active"
                      checked={formValues.is_active}
                      onCheckedChange={(checked) =>
                        handleSwitchChange("is_active", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between space-y-0 rounded-md border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="allow_auto_review">
                        自動レビューを許可
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        PRで@codeviewメンションがあった場合に自動レビューを実行します
                      </p>
                    </div>
                    <Switch
                      id="allow_auto_review"
                      name="allow_auto_review"
                      checked={formValues.allow_auto_review}
                      onCheckedChange={(checked) =>
                        handleSwitchChange("allow_auto_review", checked)
                      }
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateMutation.status === "loading"}
                  >
                    {updateMutation.status === "loading" && (
                      <LoadingSpinner size="sm" className="mr-2" />
                    )}
                    更新する
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* リポジトリ一覧テーブル */}
          {repositories && repositories.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>リポジトリ</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead>自動レビュー</TableHead>
                  <TableHead>登録日</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repositories.map((repo) => (
                  <TableRow key={repo.id}>
                    <TableCell>
                      <div className="font-medium">
                        {repo.owner}/{repo.name}
                      </div>
                      <div className="flex items-center mt-1">
                        <a
                          href={`https://github.com/${repo.owner}/${repo.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          GitHubで表示
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      {repo.is_active ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          有効
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-gray-50 text-gray-500"
                        >
                          無効
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {repo.allow_auto_review ? (
                        <Badge
                          variant="outline"
                          className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          許可
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-gray-50 text-gray-500"
                        >
                          無効
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(repo.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(repo)}
                        >
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">編集</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setSelectedRepository(repo)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">削除</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                リポジトリを削除しますか？
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {selectedRepository && (
                                  <>
                                    <span className="font-semibold">
                                      {selectedRepository.owner}/
                                      {selectedRepository.name}
                                    </span>{" "}
                                    を削除します。
                                    <br />
                                    この操作は元に戻せません。関連するすべてのデータが削除されます。
                                  </>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>キャンセル</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deleteMutation.status === "loading" && (
                                  <LoadingSpinner size="sm" className="mr-2" />
                                )}
                                削除する
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center">
              <GitFork className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <h3 className="mt-4 text-lg font-semibold">
                リポジトリがありません
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                監視するGitHubリポジトリを追加してください。
              </p>
              <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                リポジトリを追加
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-end">
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          リロード
        </Button>
      </CardFooter>
    </Card>
  );
}
