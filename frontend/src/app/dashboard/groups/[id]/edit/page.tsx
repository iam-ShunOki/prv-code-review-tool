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
import { ArrowLeft, Users, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberSelector } from "@/components/members/MemberSelector";

// フォームのバリデーションスキーマ
const groupSchema = z.object({
  name: z.string().min(1, "グループ名は必須です"),
  description: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

// メンバーの役割定義
interface SelectedMember {
  id: number;
  name: string;
  role: string;
}

// グループメンバーの役割オプション
const groupRoles = [
  { value: "manager", label: "管理者" },
  { value: "member", label: "メンバー" },
];

export default function EditGroupPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [group, setGroup] = useState<any | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [currentMembers, setCurrentMembers] = useState<SelectedMember[]>([]);
  const [activeTab, setActiveTab] = useState("basic");

  // フォームの初期化
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // グループ情報とメンバーを取得
  useEffect(() => {
    const fetchGroupData = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // グループ基本情報を取得
        const groupResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!groupResponse.ok) {
          throw new Error("グループ情報の取得に失敗しました");
        }

        const groupData = await groupResponse.json();
        setGroup(groupData.data);

        // フォームに初期値をセット
        form.reset({
          name: groupData.data.name,
          description: groupData.data.description || "",
        });

        // グループメンバーを取得
        const membersResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${params.id}/members`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!membersResponse.ok) {
          throw new Error("メンバー情報の取得に失敗しました");
        }

        const membersData = await membersResponse.json();

        // 現在のメンバーを設定
        const currentMembers = (membersData.data || []).map((member: any) => ({
          id: member.user_id,
          name: member.user.name,
          role: member.role,
        }));

        setCurrentMembers(currentMembers);
      } catch (error) {
        console.error("グループデータ取得エラー:", error);
        toast({
          title: "エラー",
          description: "グループ情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroupData();
  }, [params.id, token, form, toast]);

  // 管理者権限チェック
  if (!isLoading && user?.role !== "admin") {
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
      // グループ情報更新リクエスト
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${group.id}`,
        {
          method: "PATCH",
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

      // 新しく追加するメンバーの処理
      if (selectedMembers.length > 0) {
        const memberPromises = selectedMembers.map((member) =>
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${group.id}/members`,
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

        await Promise.all(memberPromises);
      }

      // 現在のメンバーの役割更新が必要な場合
      const roleUpdatePromises = currentMembers.map((member) => {
        // 役割が変更されているかチェック
        const initialMember = (group.members || []).find(
          (m: any) => m.user_id === member.id && m.role !== member.role
        );

        if (initialMember) {
          return fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${group.id}/members/${member.id}/role`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                role: member.role,
              }),
            }
          );
        }
        return Promise.resolve();
      });

      await Promise.all(roleUpdatePromises);

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
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="members" className="flex items-center">
            <Users className="h-4 w-4 mr-2" /> 新規メンバー追加
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
                  {selectedMembers.length > 0 ? (
                    <Button
                      type="button"
                      onClick={() => setActiveTab("members")}
                    >
                      次へ
                    </Button>
                  ) : (
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "更新中..." : "グループを更新"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle>メンバー追加</CardTitle>
                  <CardDescription>
                    新しくグループに追加するメンバーを選択してください
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormItem>
                    <FormLabel>新規メンバー</FormLabel>
                    <FormControl>
                      <MemberSelector
                        token={token || ""}
                        selectedMembers={selectedMembers}
                        onMembersChange={setSelectedMembers}
                        availableRoles={groupRoles}
                        defaultRole="member"
                        showFilters={true}
                        excludeUserIds={currentMembers.map(
                          (member) => member.id
                        )}
                      />
                    </FormControl>
                    <FormDescription>
                      グループに追加するメンバーを選択し、役割を設定してください
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
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "更新中..." : "グループを更新"}
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
