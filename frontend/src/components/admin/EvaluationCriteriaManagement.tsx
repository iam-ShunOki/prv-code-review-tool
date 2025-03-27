// frontend/src/components/admin/EvaluationCriteriaManagement.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  ArrowUpDown,
  Copy,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

// 評価基準の型定義
interface EvaluationCriterion {
  id: number;
  name: string;
  description: string;
  weight: number;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 年度設定の型定義
interface YearSetting {
  id: number;
  year: number;
  criteria: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function EvaluationCriteriaManagement() {
  // 状態管理
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [yearSettings, setYearSettings] = useState<YearSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("criteria");
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // 編集用の状態
  const [isEditing, setIsEditing] = useState(false);
  const [currentCriterion, setCurrentCriterion] = useState<
    Partial<EvaluationCriterion>
  >({
    name: "",
    description: "",
    weight: 1,
    category: "code_quality",
    is_active: true,
  });

  // 削除確認ダイアログの状態
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [criterionToDelete, setCriterionToDelete] = useState<number | null>(
    null
  );

  const { token } = useAuth();
  const { toast } = useToast();

  // 評価基準一覧の取得
  useEffect(() => {
    const fetchCriteria = async () => {
      if (!token) return;

      try {
        setIsLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("評価基準の取得に失敗しました");
        }

        const data = await response.json();
        setCriteria(data.data || []);
      } catch (error) {
        console.error("評価基準取得エラー:", error);
        toast({
          title: "エラー",
          description: "評価基準の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    // 年度設定の取得
    const fetchYearSettings = async () => {
      if (!token) return;

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria/years`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("年度設定の取得に失敗しました");
        }

        const data = await response.json();
        setYearSettings(data.data || []);

        // 利用可能な年度のリストを作成
        const currentYear = new Date().getFullYear();
        const years = Array.from(
          new Set([
            ...data.data.map((setting: YearSetting) => setting.year),
            currentYear,
            currentYear + 1,
          ])
        ).sort((a, b) => b - a); // 降順にソート

        setAvailableYears(years);

        // 設定のない現在の年度を選択
        if (
          !data.data.some(
            (setting: YearSetting) => setting.year === currentYear
          )
        ) {
          setSelectedYear(currentYear);
        } else {
          setSelectedYear(years[0]);
        }
      } catch (error) {
        console.error("年度設定取得エラー:", error);
        toast({
          title: "エラー",
          description: "年度設定の取得に失敗しました",
          variant: "destructive",
        });
      }
    };

    if (token) {
      fetchCriteria();
      fetchYearSettings();
    }
  }, [token, toast]);

  // 評価基準の保存（新規作成・更新）
  const saveCriterion = async () => {
    if (!token) return;

    try {
      const isUpdating = Boolean(currentCriterion.id);
      const endpoint = isUpdating
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria/${currentCriterion.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria`;

      const method = isUpdating ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(currentCriterion),
      });

      if (!response.ok) {
        throw new Error(
          `評価基準の${isUpdating ? "更新" : "作成"}に失敗しました`
        );
      }

      const data = await response.json();

      // 評価基準リストを更新
      if (isUpdating) {
        setCriteria(
          criteria.map((c) => (c.id === data.data.id ? data.data : c))
        );
      } else {
        setCriteria([...criteria, data.data]);
      }

      // 編集モードを終了
      setIsEditing(false);
      resetForm();

      toast({
        title: `評価基準を${isUpdating ? "更新" : "作成"}しました`,
        description: `「${data.data.name}」を${
          isUpdating ? "更新" : "作成"
        }しました`,
      });
    } catch (error) {
      console.error("評価基準保存エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "評価基準の保存に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 評価基準の削除
  const deleteCriterion = async () => {
    if (!token || criterionToDelete === null) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria/${criterionToDelete}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("評価基準の削除に失敗しました");
      }

      // 評価基準リストから削除
      setCriteria(criteria.filter((c) => c.id !== criterionToDelete));

      toast({
        title: "評価基準を削除しました",
        description: "評価基準が正常に削除されました",
      });
    } catch (error) {
      console.error("評価基準削除エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "評価基準の削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      // ダイアログを閉じる
      setIsDeleteDialogOpen(false);
      setCriterionToDelete(null);
    }
  };

  // 年度設定の保存
  const saveYearSetting = async (selectedCriteriaIds: number[]) => {
    if (!token) return;

    try {
      // 既存の設定があるか確認
      const existingSetting = yearSettings.find(
        (setting) => setting.year === selectedYear
      );

      const endpoint = existingSetting
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria/yearly-settings/${existingSetting.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/evaluation-criteria/yearly-settings`;

      const method = existingSetting ? "PUT" : "POST";

      const payload = {
        year: selectedYear,
        criteria: selectedCriteriaIds,
        is_active: true,
      };

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("年度設定の保存に失敗しました");
      }

      const data = await response.json();

      // 年度設定リストを更新
      if (existingSetting) {
        setYearSettings(
          yearSettings.map((s) => (s.id === data.data.id ? data.data : s))
        );
      } else {
        setYearSettings([...yearSettings, data.data]);
      }

      toast({
        title: "年度設定を保存しました",
        description: `${selectedYear}年度の評価基準設定を保存しました`,
      });
    } catch (error) {
      console.error("年度設定保存エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "年度設定の保存に失敗しました",
        variant: "destructive",
      });
    }
  };

  // フォームのリセット
  const resetForm = () => {
    setCurrentCriterion({
      name: "",
      description: "",
      weight: 1,
      category: "code_quality",
      is_active: true,
    });
    setIsEditing(false);
  };

  // 編集モードを開始
  const startEditing = (criterion: EvaluationCriterion) => {
    setCurrentCriterion({ ...criterion });
    setIsEditing(true);
  };

  // 削除確認ダイアログを表示
  const confirmDelete = (id: number) => {
    setCriterionToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  // 現在の年度の評価基準IDを取得
  const getCurrentYearCriteriaIds = (): number[] => {
    const setting = yearSettings.find((s) => s.year === selectedYear);
    return setting?.criteria || [];
  };

  // カテゴリの表示名を取得
  const getCategoryDisplayName = (category: string): string => {
    const categoryMap: Record<string, string> = {
      code_quality: "コード品質",
      performance: "パフォーマンス",
      security: "セキュリティ",
      usability: "ユーザビリティ",
      maintainability: "保守性",
      documentation: "ドキュメント",
      other: "その他",
    };

    return categoryMap[category] || category;
  };

  // 現在の年度に設定されている基準かどうかを確認
  const isCriterionSelectedForCurrentYear = (criterionId: number): boolean => {
    const currentYearCriteriaIds = getCurrentYearCriteriaIds();
    return currentYearCriteriaIds.includes(criterionId);
  };

  // 年度設定を更新
  const toggleCriterionForCurrentYear = async (criterionId: number) => {
    const currentIds = getCurrentYearCriteriaIds();
    let newIds: number[];

    if (currentIds.includes(criterionId)) {
      // すでに含まれている場合は削除
      newIds = currentIds.filter((id) => id !== criterionId);
    } else {
      // 含まれていない場合は追加
      newIds = [...currentIds, criterionId];
    }

    await saveYearSetting(newIds);
  };

  // 評価基準を全て選択/解除
  const toggleAllCriteria = async (select: boolean) => {
    const newIds = select
      ? criteria.filter((c) => c.is_active).map((c) => c.id)
      : [];
    await saveYearSetting(newIds);
  };

  // 既存の年度設定をコピー
  const copyFromYear = async (sourceYear: number) => {
    const sourceSetting = yearSettings.find((s) => s.year === sourceYear);
    if (!sourceSetting) return;

    await saveYearSetting(sourceSetting.criteria);

    toast({
      title: "年度設定をコピーしました",
      description: `${sourceYear}年度の設定を${selectedYear}年度にコピーしました`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-2">評価基準を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="criteria">評価基準管理</TabsTrigger>
          <TabsTrigger value="year-settings">年度別設定</TabsTrigger>
        </TabsList>

        {/* 評価基準管理タブ */}
        <TabsContent value="criteria" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>評価基準</CardTitle>
              <CardDescription>
                コードレビューで使用する評価基準を管理します
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 評価基準一覧 */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">名前</TableHead>
                      <TableHead>説明</TableHead>
                      <TableHead>カテゴリ</TableHead>
                      <TableHead className="text-center">重み</TableHead>
                      <TableHead className="text-center">状態</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {criteria.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-4 text-gray-500"
                        >
                          評価基準がまだ登録されていません
                        </TableCell>
                      </TableRow>
                    ) : (
                      criteria.map((criterion) => (
                        <TableRow key={criterion.id}>
                          <TableCell className="font-medium">
                            {criterion.name}
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {criterion.description}
                          </TableCell>
                          <TableCell>
                            {getCategoryDisplayName(criterion.category)}
                          </TableCell>
                          <TableCell className="text-center">
                            {criterion.weight}
                          </TableCell>
                          <TableCell className="text-center">
                            {criterion.is_active ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" /> 有効
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                無効
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEditing(criterion)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => confirmDelete(criterion.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="text-sm text-gray-500">
                合計: {criteria.length}個の評価基準
              </div>
              <Button
                onClick={() => {
                  resetForm();
                  setIsEditing(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                新規評価基準を追加
              </Button>
            </CardFooter>
          </Card>

          {/* 評価基準編集フォーム */}
          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {currentCriterion.id ? "評価基準を編集" : "新規評価基準"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium">
                        評価基準名<span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="name"
                        value={currentCriterion.name || ""}
                        onChange={(e) =>
                          setCurrentCriterion({
                            ...currentCriterion,
                            name: e.target.value,
                          })
                        }
                        placeholder="例: コードの可読性"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="category" className="text-sm font-medium">
                        カテゴリ<span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={currentCriterion.category || "code_quality"}
                        onValueChange={(value) =>
                          setCurrentCriterion({
                            ...currentCriterion,
                            category: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="カテゴリを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code_quality">
                            コード品質
                          </SelectItem>
                          <SelectItem value="performance">
                            パフォーマンス
                          </SelectItem>
                          <SelectItem value="security">セキュリティ</SelectItem>
                          <SelectItem value="usability">
                            ユーザビリティ
                          </SelectItem>
                          <SelectItem value="maintainability">
                            保守性
                          </SelectItem>
                          <SelectItem value="documentation">
                            ドキュメント
                          </SelectItem>
                          <SelectItem value="other">その他</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="description"
                      className="text-sm font-medium"
                    >
                      説明
                    </label>
                    <Textarea
                      id="description"
                      value={currentCriterion.description || ""}
                      onChange={(e) =>
                        setCurrentCriterion({
                          ...currentCriterion,
                          description: e.target.value,
                        })
                      }
                      placeholder="評価基準の詳細説明"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="weight" className="text-sm font-medium">
                        重み付け（1〜10）<span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="weight"
                        type="number"
                        min="1"
                        max="10"
                        value={currentCriterion.weight || 1}
                        onChange={(e) =>
                          setCurrentCriterion({
                            ...currentCriterion,
                            weight: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                      <p className="text-xs text-gray-500">
                        値が大きいほど評価への影響が大きくなります
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">状態</label>
                      <div className="flex items-center space-x-2 mt-2">
                        <Select
                          value={
                            currentCriterion.is_active ? "active" : "inactive"
                          }
                          onValueChange={(value) =>
                            setCurrentCriterion({
                              ...currentCriterion,
                              is_active: value === "active",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="状態を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">有効</SelectItem>
                            <SelectItem value="inactive">無効</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
                  キャンセル
                </Button>
                <Button onClick={saveCriterion}>
                  <Save className="mr-2 h-4 w-4" />
                  {currentCriterion.id ? "更新" : "保存"}
                </Button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>

        {/* 年度別設定タブ */}
        <TabsContent value="year-settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>年度別評価基準設定</CardTitle>
              <CardDescription>
                年度ごとに適用する評価基準を設定します
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <Select
                    value={String(selectedYear)}
                    onValueChange={(value) => setSelectedYear(parseInt(value))}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="年度を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableYears.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}年度
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {yearSettings.length > 0 && (
                    <div className="ml-4">
                      <Select
                        onValueChange={(value) => copyFromYear(parseInt(value))}
                      >
                        <SelectTrigger className="w-[240px]">
                          <SelectValue placeholder="他年度からコピー" />
                        </SelectTrigger>
                        <SelectContent>
                          {yearSettings
                            .filter((s) => s.year !== selectedYear)
                            .map((setting) => (
                              <SelectItem
                                key={setting.id}
                                value={String(setting.year)}
                              >
                                {setting.year}年度の設定をコピー
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllCriteria(true)}
                  >
                    全て選択
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllCriteria(false)}
                  >
                    全て解除
                  </Button>
                </div>
              </div>

              {/* 評価基準選択リスト */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名前</TableHead>
                      <TableHead>カテゴリ</TableHead>
                      <TableHead className="text-center">重み</TableHead>
                      <TableHead className="text-center">選択状態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {criteria.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center py-4 text-gray-500"
                        >
                          評価基準がまだ登録されていません
                        </TableCell>
                      </TableRow>
                    ) : (
                      criteria
                        .filter((c) => c.is_active)
                        .map((criterion) => {
                          const isSelected = isCriterionSelectedForCurrentYear(
                            criterion.id
                          );
                          return (
                            <TableRow key={criterion.id}>
                              <TableCell className="font-medium">
                                {criterion.name}
                              </TableCell>
                              <TableCell>
                                {getCategoryDisplayName(criterion.category)}
                              </TableCell>
                              <TableCell className="text-center">
                                {criterion.weight}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  className={isSelected ? "bg-blue-600" : ""}
                                  onClick={() =>
                                    toggleCriterionForCurrentYear(criterion.id)
                                  }
                                >
                                  {isSelected ? "選択中" : "未選択"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="text-sm text-gray-500">
                選択中: {getCurrentYearCriteriaIds().length}/
                {criteria.filter((c) => c.is_active).length}個の評価基準
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 削除確認ダイアログ */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>評価基準の削除</AlertDialogTitle>
            <AlertDialogDescription>
              この評価基準を削除してもよろしいですか？
              この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCriterion}
              className="bg-red-600 hover:bg-red-700"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
