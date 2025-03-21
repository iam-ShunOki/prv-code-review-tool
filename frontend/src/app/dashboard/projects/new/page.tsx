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
import { Calendar as CalendarIcon, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  backlog_repository_names: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export default function NewProjectPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      backlog_repository_names: "",
    },
  });

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
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "プロジェクトの作成に失敗しました"
        );
      }

      toast({
        title: "プロジェクト作成完了",
        description: "プロジェクトが正常に作成されました",
      });

      // 作成したプロジェクトの詳細ページに遷移
      const responseData = await response.json();
      router.push(`/dashboard/projects/${responseData.data.id}`);
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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                        プロジェクト名<span className="text-red-500">*</span>
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
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date("1900-01-01")}
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
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date("1900-01-01")}
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
          </Card>

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
                    <FormLabel>Backlogプロジェクトキー</FormLabel>
                    <FormControl>
                      <Input placeholder="PROJECT_KEY" {...field} />
                    </FormControl>
                    <FormDescription>
                      BacklogのプロジェクトキーはURLやプロジェクト設定から確認できます
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="backlog_repository_names"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>関連リポジトリ</FormLabel>
                    <FormControl>
                      <Input placeholder="repo1, repo2, repo3" {...field} />
                    </FormControl>
                    <FormDescription>
                      複数のリポジトリはカンマ区切りで入力してください
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>

            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/projects")}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "作成中..." : "プロジェクトを作成"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
