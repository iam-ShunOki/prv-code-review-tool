// frontend/src/app/dashboard/projects/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar as CalendarIcon, ArrowLeft, Users } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// コンポーネントをインポート
import { RepositorySelector } from "@/components/backlog/RepositorySelector";
import { MemberSelector } from "@/components/members/MemberSelector";

// フォームのバリデーションスキーマ
const projectSchema = z.object({
  name: z.string().min(1, "プロジェクト名は必須です"),
  code: z
    .string()
    .min(1, "プロジェクトコードは必須です")
    .max(50, "コードは50文字以内で入力してください")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "英数字、ハイフン、アンダースコアのみ使用できます"
    ),
  description: z.string().optional(),
  status: z.enum(["planning", "active", "completed", "archived"]),
  start_date: z.date().optional().nullable(),
  end_date: z.date().optional().nullable(),
  backlog_project_key: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

// メンバーの役割定義
interface SelectedMember {
  id: number;
  name: string;
  role: string;
}

// プロジェクトメンバーの役割オプション
const projectRoles = [
  { value: "leader", label: "リーダー" },
  { value: "member", label: "メンバー" },
  { value: "reviewer", label: "レビュアー" },
  { value: "observer", label: "オブザーバー" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRepositories, setSelectedRepositories] = useState<string[]>(
    []
  );
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [activeTab, setActiveTab] = useState("basic");

  // フォームの初期化
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      status: "planning",
      start_date: null,
      end_date: null,
      backlog_project_key: "",
    },
  });

  // Backlogプロジェクトキー変更
  const handleBacklogProjectKeyChange = (projectKey: string) => {
    form.setValue("backlog_project_key", projectKey);
  };

  // 管理者権限チェック
  if (user?.role !== "admin") {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">管理者権限が必要です</h2>
        <p className="mt-2 text-gray-500">
          プロジェクトの作成には管理者権限が必要です。
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

  // フォーム送信処理
  const onSubmit = async (data: ProjectFormValues) => {
    setIsSubmitting(true);

    try {
      // プロジェクト作成リクエスト
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...data,
            start_date: data.start_date
              ? format(data.start_date, "yyyy-MM-dd")
              : null,
            end_date: data.end_date
              ? format(data.end_date, "yyyy-MM-dd")
              : null,
            backlog_repository_names:
              selectedRepositories.length > 0
                ? selectedRepositories.join(",")
                : null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "プロジェクトの作成に失敗しました"
        );
      }

      const responseData = await response.json();
      const projectId = responseData.data.id;

      // メンバーがいる場合は追加
      if (selectedMembers.length > 0) {
        // メンバー追加用のリクエスト
        const memberPromises = selectedMembers.map((member) =>
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/members`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                userId: member.id,
                role: member.role,
              }),
            }
          )
        );

        // すべてのメンバー追加リクエストを実行
        await Promise.all(memberPromises);
      }

      toast({
        title: "プロジェクト作成完了",
        description: "プロジェクトが正常に作成されました",
      });

      // 作成したプロジェクトの詳細ページに遷移
      router.push(`/dashboard/projects/${projectId}`);
    } catch (error) {
      console.error("プロジェクト作成エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "プロジェクトの作成に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/projects")}
          className="mr-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
        </Button>
        <h1 className="text-2xl font-bold">新規プロジェクト作成</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="backlog">Backlog連携</TabsTrigger>
          <TabsTrigger value="members" className="flex items-center">
            <Users className="h-4 w-4 mr-2" /> メンバー
            {selectedMembers.length > 0 && (
              <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {selectedMembers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8 mt-6"
          >
            <TabsContent value="basic">
              <Card>
                <CardHeader>
                  <CardTitle>基本情報</CardTitle>
                  <CardDescription>
                    プロジェクトの基本情報を入力してください
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            プロジェクト名
                            <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="プロジェクト名" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            プロジェクトコード
                            <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="project-code" {...field} />
                          </FormControl>
                          <FormDescription>
                            英数字、ハイフン、アンダースコアのみ使用可能
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>説明</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="プロジェクトの説明"
                            className="min-h-32"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          ステータス<span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="ステータスを選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="planning">計画中</SelectItem>
                            <SelectItem value="active">進行中</SelectItem>
                            <SelectItem value="completed">完了</SelectItem>
                            <SelectItem value="archived">アーカイブ</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="start_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>開始日</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "yyyy/MM/dd", {
                                      locale: ja,
                                    })
                                  ) : (
                                    <span>開始日を選択</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={field.value || undefined}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="end_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>終了日</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "yyyy/MM/dd", {
                                      locale: ja,
                                    })
                                  ) : (
                                    <span>終了日を選択</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={field.value || undefined}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/dashboard/projects")}
                  >
                    キャンセル
                  </Button>
                  <Button type="button" onClick={() => setActiveTab("backlog")}>
                    次へ
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="backlog">
              <Card>
                <CardHeader>
                  <CardTitle>Backlog連携設定</CardTitle>
                  <CardDescription>
                    Backlogとの連携情報（オプション）
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="backlog_project_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Backlogプロジェクト</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="PROJECT_KEY"
                            {...field}
                            disabled={true} // リポジトリセレクターから自動設定
                          />
                        </FormControl>
                        <FormDescription>
                          リポジトリの選択時に自動的に設定されます
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem>
                    <FormLabel>関連リポジトリ</FormLabel>
                    <FormControl>
                      <RepositorySelector
                        token={token || ""}
                        selectedRepositories={selectedRepositories}
                        onRepositoriesChange={setSelectedRepositories}
                        backlogProjectKey={form.watch("backlog_project_key")}
                        onBacklogProjectKeyChange={
                          handleBacklogProjectKeyChange
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      プロジェクトに関連付けるリポジトリを選択してください
                    </FormDescription>
                  </FormItem>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("basic")}
                  >
                    戻る
                  </Button>
                  <Button type="button" onClick={() => setActiveTab("members")}>
                    次へ
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle>メンバー設定</CardTitle>
                  <CardDescription>
                    プロジェクトに参加するメンバーを選択してください（オプション）
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormItem>
                    <FormLabel>プロジェクトメンバー</FormLabel>
                    <FormControl>
                      <MemberSelector
                        token={token || ""}
                        selectedMembers={selectedMembers}
                        onMembersChange={setSelectedMembers}
                        availableRoles={projectRoles}
                        defaultRole="member"
                        showFilters={true}
                      />
                    </FormControl>
                    <FormDescription>
                      プロジェクトに参加するメンバーを選択し、役割を設定してください
                    </FormDescription>
                  </FormItem>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("backlog")}
                  >
                    戻る
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "作成中..." : "プロジェクトを作成"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </form>
        </Form>
      </Tabs>
    </div>
  );
}
