// frontend/src/app/dashboard/groups/[id]/page.tsx
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  ClipboardList,
  Edit,
  Trash2,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// グループの型定義
interface Group {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  members: Member[];
  reviews: Review[];
}

// メンバーの型定義
interface Member {
  id: number;
  user_id: number;
  role: "leader" | "member" | "reviewer" | "observer";
  joined_at: string;
  user: {
    id: number;
    name: string;
    email: string;
    department: string | null;
    join_year: number | null;
  };
}

// レビューの型定義
interface Review {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  user: {
    id: number;
    name: string;
  };
}

export default function GroupDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState("members");

  // グループ詳細を取得
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
  }, [params.id, token, toast]);

  // グループを削除
  const handleDeleteGroup = async () => {
    if (!group || !isAdmin) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${group.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("グループの削除に失敗しました");
      }

      toast({
        title: "削除完了",
        description: "グループが削除されました",
      });

      router.push("/dashboard/groups");
    } catch (error) {
      console.error("グループ削除エラー:", error);
      toast({
        title: "エラー",
        description: "グループの削除に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  // メンバーの役割を表示
  const getRoleName = (role: string) => {
    switch (role) {
      case "leader":
        return "リーダー";
      case "member":
        return "メンバー";
      case "reviewer":
        return "レビュアー";
      case "observer":
        return "オブザーバー";
      default:
        return role;
    }
  };

  // レビューステータスのバッジを表示
  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">レビュー待ち</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-800">レビュー中</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-800">完了</Badge>;
      default:
        return <Badge variant="outline">不明</Badge>;
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/groups")}
          className="self-start"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 一覧に戻る
        </Button>
        {isAdmin && (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/dashboard/groups/${group.id}/edit`)}
            >
              <Edit className="mr-2 h-4 w-4" /> 編集
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" /> 削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>グループの削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    グループ「{group.name}
                    」を削除しますか？この操作は元に戻せません。
                    グループを削除すると、メンバーシップ情報が削除されますが、ユーザーとレビューは削除されません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteGroup}>
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
            <div>
              <CardTitle className="text-2xl">{group.name}</CardTitle>
              <CardDescription className="mt-1">
                作成日: {formatDate(group.created_at)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-1">説明</h3>
            <p className="text-sm text-gray-600">
              {group.description || "説明はありません"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-1">メンバー数</h3>
              <p className="text-sm text-gray-600 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                {group.members?.length || 0}人
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">レビュー数</h3>
              <p className="text-sm text-gray-600 flex items-center">
                <ClipboardList className="h-4 w-4 mr-1" />
                {group.reviews?.length || 0}件
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="flex items-center">
            <Users className="h-4 w-4 mr-2" /> メンバー (
            {group.members?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center">
            <ClipboardList className="h-4 w-4 mr-2" /> レビュー (
            {group.reviews?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">グループメンバー</CardTitle>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() =>
                      router.push(`/dashboard/groups/${group.id}/members`)
                    }
                  >
                    <UserPlus className="h-4 w-4 mr-2" /> メンバー管理
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {group.members && group.members.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名前</TableHead>
                      <TableHead>メール</TableHead>
                      <TableHead>役割</TableHead>
                      <TableHead>部署</TableHead>
                      <TableHead>参加日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.user.name}
                        </TableCell>
                        <TableCell>{member.user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getRoleName(member.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>{member.user.department || "-"}</TableCell>
                        <TableCell>{formatDate(member.joined_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  メンバーがまだ登録されていません
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">グループのレビュー</CardTitle>
                <Button
                  size="sm"
                  onClick={() =>
                    router.push(`/dashboard/reviews/new?group=${group.id}`)
                  }
                >
                  <ClipboardList className="h-4 w-4 mr-2" /> 新規レビュー
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <TableCell>{review.user?.name || "不明なユーザー"}</TableCell>
              // 以下は完全なレビューテーブル部分の修正例です
              {group.reviews && group.reviews.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル</TableHead>
                      <TableHead>提出者</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>作成日</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.reviews.map((review) => (
                      <TableRow key={review.id}>
                        <TableCell className="font-medium">
                          {review.title}
                        </TableCell>
                        <TableCell>
                          {review.user?.name || "不明なユーザー"}
                        </TableCell>
                        <TableCell>
                          {getReviewStatusBadge(review.status)}
                        </TableCell>
                        <TableCell>{formatDate(review.created_at)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              router.push(`/dashboard/reviews/${review.id}`)
                            }
                          >
                            詳細
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  レビューがまだ登録されていません
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
