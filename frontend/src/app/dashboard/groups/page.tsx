// frontend/src/app/dashboard/groups/page.tsx
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  PlusCircle,
  Users,
  Search,
  ClipboardList,
  Briefcase,
  UserPlus,
  Filter,
  LayoutGrid,
  ListFilter,
} from "lucide-react";
import Link from "next/link";

// グループの型定義
interface Group {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  review_count: number;
}

export default function GroupsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const isAdmin = user?.role === "admin";

  // グループ一覧を取得
  useEffect(() => {
    const fetchGroups = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // 管理者は全グループ、それ以外は自分が所属するグループを取得
        const endpoint = isAdmin
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/groups/`
          : `${process.env.NEXT_PUBLIC_API_URL}/api/groups/my`;

        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("グループ一覧の取得に失敗しました");
        }

        const data = await response.json();
        const groups = data.data || [];

        // 各グループのメンバー数を計算して追加
        const enhancedGroups = await Promise.all(
          groups.map(async (group: { id: any; review_count: any }) => {
            try {
              // メンバー情報を取得
              const membersResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/groups/${group.id}/members`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );

              if (membersResponse.ok) {
                const membersData = await membersResponse.json();
                const members = membersData.data || [];

                return {
                  ...group,
                  member_count: members.length,
                  // すでにreview_countが含まれている場合は上書きしない
                  review_count: group.review_count || 0,
                };
              }
            } catch (error) {
              console.error(
                `グループ ${group.id} のメンバー取得エラー:`,
                error
              );
            }

            // エラーが発生した場合やレスポンスが正常でない場合のデフォルト値
            return {
              ...group,
              member_count: 0,
              review_count: group.review_count || 0,
            };
          })
        );

        setGroups(enhancedGroups);
        setFilteredGroups(enhancedGroups);
      } catch (error) {
        console.error("グループ取得エラー:", error);
        toast({
          title: "エラー",
          description: "グループ一覧の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroups();
  }, [token, isAdmin, toast]);

  // 検索フィルタリング
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredGroups(groups);
    } else {
      const filtered = groups.filter(
        (group) =>
          group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          group.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredGroups(filtered);
    }
  }, [searchQuery, groups]);

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">グループ</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? "すべてのグループとそのメンバー"
              : "所属しているグループ"}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => router.push("/dashboard/groups/new")}
            className="flex items-center"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> 新規グループ
          </Button>
        )}
      </div>

      {/* 検索とビュー切り替え */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="グループ名や説明で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex space-x-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
            className="h-10 w-10"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
            className="h-10 w-10"
          >
            <ListFilter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <Card className="text-center p-10">
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-500">
                {searchQuery
                  ? "検索条件に一致するグループがありません"
                  : isAdmin
                  ? "グループがまだ登録されていません"
                  : "所属しているグループはありません"}
              </p>
              {isAdmin && !searchQuery && (
                <Button
                  onClick={() => router.push("/dashboard/groups/new")}
                  className="flex items-center mx-auto"
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> 最初のグループを作成
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        // グリッドビュー
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map((group) => (
            <Card key={group.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50 py-3 px-4">
                <CardTitle className="text-lg">{group.name}</CardTitle>
                <CardDescription className="text-xs">
                  作成日: {formatDate(group.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm mb-4 line-clamp-2">
                  {group.description || "説明はありません"}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div className="flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    メンバー: {group.member_count}人
                  </div>
                  <div className="flex items-center">
                    <ClipboardList className="h-3 w-3 mr-1" />
                    レビュー: {group.review_count}件
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-gray-50 p-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/dashboard/groups/${group.id}`)}
                >
                  詳細を見る
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        // リストビュー
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>グループ名</TableHead>
                  <TableHead>説明</TableHead>
                  <TableHead>メンバー数</TableHead>
                  <TableHead>レビュー数</TableHead>
                  <TableHead>作成日</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {group.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="flex items-center w-fit"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        {group.member_count}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="flex items-center w-fit"
                      >
                        <ClipboardList className="h-3 w-3 mr-1" />
                        {group.review_count}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(group.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(`/dashboard/groups/${group.id}`)
                        }
                      >
                        詳細
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
