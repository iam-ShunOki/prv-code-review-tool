// frontend/src/app/dashboard/groups/new/page.tsx
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
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft } from "lucide-react";

// フォームのバリデーションスキーマ
const groupSchema = z.object({
  name: z.string().min(1, "グループ名は必須です"),
  description: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

export default function NewGroupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // フォームの初期化
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // 管理者権限チェック
  if (user?.role !== "admin") {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">管理者権限が必要です</h2>
        <p className="mt-2 text-gray-500">
          グループの作成には管理者権限が必要です。
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

  // フォーム送信処理
  const onSubmit = async (data: GroupFormValues) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/groups`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "グループの作成に失敗しました");
      }

      toast({
        title: "グループ作成完了",
        description: "グループが正常に作成されました",
      });

      // 作成したグループの詳細ページに遷移
      const responseData = await response.json();
      router.push(`/dashboard/groups/${responseData.data.id}`);
    } catch (error) {
      console.error("グループ作成エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "グループの作成に失敗しました",
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
          onClick={() => router.push("/dashboard/groups")}
          className="mr-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
        </Button>
        <h1 className="text-2xl font-bold">新規グループ作成</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>グループ情報</CardTitle>
              <CardDescription>
                新しいグループの情報を入力してください
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
                onClick={() => router.push("/dashboard/groups")}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "作成中..." : "グループを作成"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
