// frontend/src/app/dashboard/reviews/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dynamic from "next/dynamic";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// Monaco Editor をクライアントサイドのみでロード
const MonacoEditor = dynamic(() => import("react-monaco-editor"), {
  ssr: false,
});

// フォームのバリデーションスキーマ
const reviewSchema = z.object({
  title: z.string().min(3, "タイトルは3文字以上入力してください"),
  description: z.string().optional(),
  expectation: z.string().optional(),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

export default function NewReviewPage() {
  const [code, setCode] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, token } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      title: "",
      description: "",
      expectation: "",
    },
  });

  const onSubmit = async (formData: ReviewFormValues) => {
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
      const reviewResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/reviews`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description || "",
          }),
        }
      );

      if (!reviewResponse.ok) {
        throw new Error("レビュー作成に失敗しました");
      }

      const reviewData = await reviewResponse.json();
      const reviewId = reviewData.data.id;

      // コード提出
      const submissionResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/submissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            review_id: reviewId,
            code_content: code,
            expectation: formData.expectation || "",
          }),
        }
      );

      if (!submissionResponse.ok) {
        throw new Error("コード提出に失敗しました");
      }

      toast({
        title: "コードレビュー依頼を送信しました",
        description: "AIによるレビュー結果をお待ちください",
      });

      // レビュー一覧ページに遷移
      // router.push("/dashboard/reviews");
      router.push(`/dashboard/reviews/${reviewId}`);
    } catch (error) {
      console.error("レビュー依頼エラー:", error);
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error
            ? error.message
            : "レビュー依頼の送信に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Monaco Editor の設定
  const editorOptions = {
    selectOnLineNumbers: true,
    roundedSelection: false,
    readOnly: false,
    cursorStyle: "line",
    automaticLayout: true,
    minimap: { enabled: true },
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">新規コードレビュー依頼</h1>
        <p className="text-gray-500 mt-2">
          レビューしたいコードを入力して、AIによる詳細なフィードバックを受け取れます。
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>レビュー情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                タイトル<span className="text-red-500">*</span>
              </label>
              <Input
                id="title"
                {...register("title")}
                placeholder="レビューのタイトル"
              />
              {errors.title && (
                <p className="text-sm text-red-500">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                説明
              </label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="レビューの背景や目的（任意）"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>コード入力</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>期待する結果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Textarea
                id="expectation"
                {...register("expectation")}
                placeholder="コードに期待する動作や結果、気になる点など（任意）"
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "送信中..." : "レビュー依頼を送信"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
