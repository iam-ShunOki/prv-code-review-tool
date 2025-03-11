// frontend/src/app/dashboard/employees/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  User,
  Mail,
  Calendar,
  Building,
  Lock,
  Edit,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

// 社員情報の型定義
interface Employee {
  id: number;
  name: string;
  email: string;
  role: "admin" | "trainee";
  department?: string;
  join_year?: number;
  created_at: string;
  updated_at: string;
}

// 編集フォームのバリデーションスキーマ
const formSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  email: z.string().email("有効なメールアドレスを入力してください"),
  role: z.enum(["admin", "trainee"]),
  department: z.string().optional(),
  join_year: z.string().optional(),
});

// パスワードリセット用スキーマ
const passwordSchema = z
  .object({
    new_password: z.string().min(6, "パスワードは6文字以上で入力してください"),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "パスワードが一致しません",
    path: ["confirm_password"],
  });

export default function EmployeeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // フォームの初期化
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "trainee" as const,
      department: "",
      join_year: "",
    },
  });

  // パスワードリセットフォーム初期化
  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    formState: { errors: passwordErrors },
    reset: resetPassword,
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      new_password: "",
      confirm_password: "",
    },
  });

  // 社員情報を取得
  useEffect(() => {
    const fetchEmployeeData = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/employees/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("社員情報の取得に失敗しました");
        }

        const data = await response.json();
        setEmployee(data.data);

        // フォームの初期値をセット
        reset({
          name: data.data.name,
          email: data.data.email,
          role: data.data.role,
          department: data.data.department || "",
          join_year: data.data.join_year ? String(data.data.join_year) : "",
        });
      } catch (error) {
        console.error("社員情報取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "社員情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchEmployeeData();
    }
  }, [params.id, token, toast, reset]);

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 社員情報更新送信
  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      // 数値に変換
      const formData = {
        ...data,
        join_year: data.join_year ? parseInt(data.join_year) : undefined,
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/employees/${params.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error("社員情報の更新に失敗しました");
      }

      const responseData = await response.json();
      setEmployee(responseData.data);
      setIsEditDialogOpen(false);
      toast({
        title: "更新完了",
        description: "社員情報が更新されました",
      });
    } catch (error) {
      console.error("更新エラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "社員情報の更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // パスワードリセット送信
  const onPasswordSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/employees/${params.id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ new_password: data.new_password }),
        }
      );

      if (!response.ok) {
        throw new Error("パスワードリセットに失敗しました");
      }

      setIsPasswordDialogOpen(false);
      resetPassword();
      toast({
        title: "パスワードリセット完了",
        description: "パスワードが正常にリセットされました",
      });
    } catch (error) {
      console.error("パスワードリセットエラー:", error);
      toast({
        title: "エラーが発生しました",
        description: "パスワードリセットに失敗しました",
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
          <p className="mt-2">社員情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/employees")}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
          </Button>
        </div>
        <Card className="text-center p-10">
          <CardContent>
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">社員が見つかりません</h2>
            <p className="text-gray-500 mb-4">
              指定された社員は存在しないか、アクセス権限がありません。
            </p>
            <Button
              onClick={() => router.push("/dashboard/employees")}
              className="mx-auto"
            >
              社員一覧に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/employees")}
          className="mr-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> 戻る
        </Button>
        <div className="text-sm text-gray-500">
          <Link href="/dashboard" className="hover:underline">
            ダッシュボード
          </Link>{" "}
          <ChevronRight className="inline h-3 w-3" />{" "}
          <Link href="/dashboard/employees" className="hover:underline">
            社員管理
          </Link>{" "}
          <ChevronRight className="inline h-3 w-3" /> {employee.name}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl">社員詳細情報</CardTitle>
            <div>
              <Button onClick={() => setIsEditDialogOpen(true)}>
                <Edit className="mr-2 h-4 w-4" />
                編集
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500">基本情報</h3>
                <div className="border rounded-md p-4 space-y-4">
                  <div className="flex items-start">
                    <User className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        氏名
                      </div>
                      <div className="font-medium">{employee.name}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Mail className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        メールアドレス
                      </div>
                      <div>{employee.email}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Building className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        部署
                      </div>
                      <div>{employee.department || "未設定"}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        入社年度
                      </div>
                      <div>
                        {employee.join_year
                          ? `${employee.join_year}年度`
                          : "未設定"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500">
                  アカウント情報
                </h3>
                <div className="border rounded-md p-4 space-y-4">
                  <div className="flex items-start">
                    <div className="h-5 w-5 text-gray-400 mt-0.5 mr-3">ID</div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        社員ID
                      </div>
                      <div>{employee.id}</div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Lock className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                    <div>
                      <div className="text-sm font-medium text-gray-500">
                        権限
                      </div>
                      <div
                        className={`inline-flex px-2 py-1 rounded text-xs ${
                          employee.role === "admin"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {employee.role === "admin" ? "管理者" : "新入社員"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Button
                      variant="outline"
                      onClick={() => setIsPasswordDialogOpen(true)}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      パスワードのリセット
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500">
                  システム情報
                </h3>
                <div className="border rounded-md p-4 space-y-4">
                  <div>
                    <div className="text-sm font-medium text-gray-500">
                      アカウント作成日
                    </div>
                    <div>{formatDate(employee.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">
                      最終更新日
                    </div>
                    <div>{formatDate(employee.updated_at)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500">
                  評価・レビュー
                </h3>
                <div className="border rounded-md p-4">
                  <p className="text-center text-gray-500 py-6">
                    評価情報は開発中です
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/employees")}
          >
            社員一覧に戻る
          </Button>
        </CardFooter>
      </Card>

      {/* 編集ダイアログ */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>社員情報の編集</DialogTitle>
            <DialogDescription>社員の基本情報を更新します。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  氏名<span className="text-red-500">*</span>
                </label>
                <Input {...register("name")} placeholder="氏名を入力" />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  メールアドレス<span className="text-red-500">*</span>
                </label>
                <Input
                  {...register("email")}
                  type="email"
                  placeholder="メールアドレスを入力"
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  権限<span className="text-red-500">*</span>
                </label>
                <Select
                  value={employee.role}
                  onValueChange={(value) => setValue("role", value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理者</SelectItem>
                    <SelectItem value="trainee">新入社員</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">部署</label>
                <Input
                  {...register("department")}
                  placeholder="部署名を入力（任意）"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">入社年度</label>
                <Input
                  {...register("join_year")}
                  type="number"
                  placeholder="入社年度（西暦）を入力（任意）"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "更新中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* パスワードリセットダイアログ */}
      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>パスワードリセット</DialogTitle>
            <DialogDescription>
              社員のパスワードを新しいものに変更します。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitPassword(onPasswordSubmit)}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  新しいパスワード<span className="text-red-500">*</span>
                </label>
                <Input
                  {...registerPassword("new_password")}
                  type="password"
                  placeholder="新しいパスワードを入力"
                />
                {passwordErrors.new_password && (
                  <p className="text-sm text-red-500">
                    {passwordErrors.new_password.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  パスワード確認<span className="text-red-500">*</span>
                </label>
                <Input
                  {...registerPassword("confirm_password")}
                  type="password"
                  placeholder="パスワードを再入力"
                />
                {passwordErrors.confirm_password && (
                  <p className="text-sm text-red-500">
                    {passwordErrors.confirm_password.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPasswordDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "リセット中..." : "パスワードをリセット"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
