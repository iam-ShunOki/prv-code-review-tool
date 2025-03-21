// frontend/src/app/dashboard/groups/[id]/edit/page.tsx
"use client";

import { useState, useEffect } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft } from "lucide-react";

// フォームのバリデーションスキーマ
const groupSchema = z.object({
  name: z.string().min(1, "グループ名は必須です"),
  description: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

// グループの型定義
interface Group {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function EditGroupPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);

  // フォームの初期化
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // グループ情報を取得して初期値をセット
  useEffect(() => {
    const fetchGroup = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("グループ情報の取得に失敗しました");
        }

        const data = await response.json();
        setGroup(data.data);

        // フォームに初期値をセット
        form.reset({
          name: data.data.name,
          description: data.data.description || "",
        });
      } catch (error) {
        console.error("グループ詳細取得エラー:", error);
        toast({
          title: "エラー",
          description: "グループ情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [params.id, token, toast, form]);

  // 管理者権限チェック
  if (user?.role !== "admin") {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">管理者権限が必要です</h2>
        <p className="mt-2 text-gray-500">
          グループの編集には管理者権限が必要です。
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/dashboard/groups/${params.id}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> グループ詳細に戻る
        </Button>
      </div>
    );
  }

  // フォーム送信処理
  const onSubmit = async (data: GroupFormValues) => {
    if (!group) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${group.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "グループの更新に失敗しました");
      }

      toast({
        title: "グループ更新完了",
        description: "グループ情報が正常に更新されました",
      });

      // グループ詳細ページに戻る
      router.push(`/dashboard/groups/${group.id}`);
    } catch (error) {
      console.error("グループ更新エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "グループの更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
          <p className="mt-2">グループ情報を読み込み中...</p>
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
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/groups/${group.id}`)}
          className="mr-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
        </Button>
        <h1 className="text-2xl font-bold">グループ編集</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>グループ情報</CardTitle>
              <CardDescription>
                グループの情報を編集してください
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      グループ名<span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="グループ名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>説明</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="グループの説明やメンバーの特徴など"
                        className="min-h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      グループの目的や活動内容について記述してください
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
                onClick={() => router.push(`/dashboard/groups/${group.id}`)}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "更新中..." : "グループを更新"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
