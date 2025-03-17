// frontend/src/components/admin/UsageLimitSettings.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  Users,
  Settings,
  RotateCw,
  Save,
  ArrowUpDown,
  FileText,
  Code,
  MessageCircle,
} from "lucide-react";

interface UsageLimit {
  id: number;
  feature_key: string;
  daily_limit: number;
  description: string;
  is_active: boolean;
}

interface UserUsage {
  user_id: number;
  user_name: string;
  feature_key: string;
  count: number;
}

export function UsageLimitSettings() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const { updateFeatureLimit } = useUsageLimit();
  const [limits, setLimits] = useState<UsageLimit[]>([]);
  const [userUsages, setUserUsages] = useState<UserUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editableLimits, setEditableLimits] = useState<{
    [key: string]: number;
  }>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  }>({ key: "user_name", direction: "asc" });

  // 利用制限一覧を取得
  const fetchLimits = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/usage-limits`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("利用制限の取得に失敗しました");
      }

      const data = await response.json();
      setLimits(data.data);

      // 編集用の状態を初期化
      const initialEditableLimits: { [key: string]: number } = {};
      data.data.forEach((limit: UsageLimit) => {
        initialEditableLimits[limit.feature_key] = limit.daily_limit;
      });
      setEditableLimits(initialEditableLimits);
    } catch (error) {
      console.error("利用制限取得エラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "利用制限の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 全ユーザーの利用状況を取得
  const fetchUserUsages = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/usage-limits/stats/today`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("利用状況の取得に失敗しました");
      }

      const data = await response.json();
      setUserUsages(data.data);
    } catch (error) {
      console.error("利用状況取得エラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "利用状況の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 初回読み込み時にデータを取得
  useEffect(() => {
    if (token && user?.role === "admin") {
      fetchLimits();
      fetchUserUsages();
    }
  }, [token, user?.role]);

  // 利用制限を更新
  const handleUpdateLimit = async (featureKey: string) => {
    const newLimit = editableLimits[featureKey];
    if (!newLimit || newLimit <= 0) {
      toast({
        title: "入力エラー",
        description: "有効な制限値を入力してください",
        variant: "destructive",
      });
      return;
    }

    const success = await updateFeatureLimit(featureKey, newLimit);
    if (success) {
      // 更新成功時は全体を再取得
      fetchLimits();
    }
  };

  // 入力値の変更を処理
  const handleLimitChange = (featureKey: string, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      setEditableLimits({ ...editableLimits, [featureKey]: numValue });
    }
  };

  // 機能名を日本語に変換
  const getFeatureName = (featureKey: string) => {
    switch (featureKey) {
      case "code_review":
        return "AIコードレビュー";
      case "ai_chat":
        return "AIチャット";
      default:
        return featureKey;
    }
  };

  // 機能アイコンを取得
  const getFeatureIcon = (featureKey: string) => {
    switch (featureKey) {
      case "code_review":
        return <Code className="h-4 w-4 mr-2" />;
      case "ai_chat":
        return <MessageCircle className="h-4 w-4 mr-2" />;
      default:
        return <FileText className="h-4 w-4 mr-2" />;
    }
  };

  // ソート処理
  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // ソートされたユーザー利用状況を取得
  const getSortedUserUsages = () => {
    if (!userUsages) return [];

    const sortableItems = [...userUsages];
    sortableItems.sort((a, b) => {
      if (sortConfig.key === "user_name") {
        if (a.user_name < b.user_name)
          return sortConfig.direction === "asc" ? -1 : 1;
        if (a.user_name > b.user_name)
          return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      }

      if (sortConfig.key === "count") {
        return sortConfig.direction === "asc"
          ? a.count - b.count
          : b.count - a.count;
      }

      if (sortConfig.key === "feature_key") {
        if (a.feature_key < b.feature_key)
          return sortConfig.direction === "asc" ? -1 : 1;
        if (a.feature_key > b.feature_key)
          return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      }

      return 0;
    });

    return sortableItems;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="h-5 w-5 mr-2" />
          利用制限設定
        </CardTitle>
        <CardDescription>
          AI機能の1日あたりの利用回数制限を管理します
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="limits">
          <TabsList className="mb-4">
            <TabsTrigger value="limits" className="flex items-center">
              <Settings className="h-4 w-4 mr-2" />
              制限設定
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              利用状況
            </TabsTrigger>
          </TabsList>

          {/* 制限設定タブ */}
          <TabsContent value="limits">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>機能</TableHead>
                  <TableHead>説明</TableHead>
                  <TableHead>現在の制限</TableHead>
                  <TableHead>新しい制限</TableHead>
                  <TableHead className="text-right">アクション</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      <div className="flex justify-center items-center">
                        <RotateCw className="h-4 w-4 animate-spin mr-2" />
                        読み込み中...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : limits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      設定可能な制限がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  limits.map((limit) => (
                    <TableRow key={limit.id}>
                      <TableCell className="font-medium flex items-center">
                        {getFeatureIcon(limit.feature_key)}
                        {getFeatureName(limit.feature_key)}
                      </TableCell>
                      <TableCell>{limit.description}</TableCell>
                      <TableCell>{limit.daily_limit}回/日</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={editableLimits[limit.feature_key]}
                          onChange={(e) =>
                            handleLimitChange(limit.feature_key, e.target.value)
                          }
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateLimit(limit.feature_key)}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          更新
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          {/* 利用状況タブ */}
          <TabsContent value="usage">
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchUserUsages}
                disabled={isLoading}
              >
                <RotateCw
                  className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                />
                最新の情報に更新
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => requestSort("user_name")}
                  >
                    <div className="flex items-center">
                      社員名
                      {sortConfig.key === "user_name" && (
                        <ArrowUpDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => requestSort("feature_key")}
                  >
                    <div className="flex items-center">
                      機能
                      {sortConfig.key === "feature_key" && (
                        <ArrowUpDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-right"
                    onClick={() => requestSort("count")}
                  >
                    <div className="flex items-center justify-end">
                      今日の利用回数
                      {sortConfig.key === "count" && (
                        <ArrowUpDown className="h-4 w-4 ml-1" />
                      )}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4">
                      <div className="flex justify-center items-center">
                        <RotateCw className="h-4 w-4 animate-spin mr-2" />
                        読み込み中...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : getSortedUserUsages().length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4">
                      今日の利用記録はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  getSortedUserUsages().map((usage, index) => (
                    <TableRow
                      key={`${usage.user_id}-${usage.feature_key}-${index}`}
                    >
                      <TableCell className="font-medium">
                        {usage.user_name}
                      </TableCell>
                      <TableCell className="flex items-center">
                        {getFeatureIcon(usage.feature_key)}
                        {getFeatureName(usage.feature_key)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {usage.count}回
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-end">
        <Button variant="outline" onClick={fetchLimits}>
          <RotateCw className="h-4 w-4 mr-2" />
          リロード
        </Button>
      </CardFooter>
    </Card>
  );
}
