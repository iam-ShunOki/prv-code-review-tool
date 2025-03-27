"use client";

import { EvaluationCriteriaManagement } from "@/components/admin/EvaluationCriteriaManagement";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EvaluationCriteriaPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 認証状態を確認
    if (user) {
      if (user.role === "admin") {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
      setIsLoading(false);
    }
  }, [user, router]);

  // 認証チェック中の表示
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
          <p className="mt-2">認証情報を確認中...</p>
        </div>
      </div>
    );
  }

  // 権限がない場合の表示
  if (!isAuthorized) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>アクセス拒否</AlertTitle>
        <AlertDescription>
          このページにアクセスする権限がありません。管理者権限が必要です。
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">評価基準管理</h3>
        <p className="text-muted-foreground">
          評価基準の作成、編集、年度ごとの設定を管理します
        </p>
      </div>

      <EvaluationCriteriaManagement />
    </div>
  );
}
