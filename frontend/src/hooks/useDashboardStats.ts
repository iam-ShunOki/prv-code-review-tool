// frontend/src/hooks/useDashboardStats.ts
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

// 管理者用統計情報の型
type AdminStats = {
  pendingReviews: number;
  totalReviews: number;
  registeredEmployees: number;
};

// 一般ユーザー用統計情報の型
type UserStats = {
  waitingReviews: number;
  feedbackCount: number;
  currentLevel: string;
};

// ダッシュボード統計情報の型（管理者または一般ユーザー）
export type DashboardStats = AdminStats | UserStats;

// ダッシュボード統計情報を取得するカスタムフック
export const useDashboardStats = () => {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("ダッシュボード統計情報の取得に失敗しました");
        }

        const data = await response.json();

        if (data.success) {
          setStats(data.data);
        } else {
          throw new Error(data.message || "データの取得に失敗しました");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
        console.error("ダッシュボード統計情報取得エラー:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchStats();
    }
  }, [token]);

  // 型ガード関数：AdminStatsかどうかを判定
  const isAdminStats = (stats: any): stats is AdminStats => {
    return "pendingReviews" in stats && "registeredEmployees" in stats;
  };

  // 型ガード関数：UserStatsかどうかを判定
  const isUserStats = (stats: any): stats is UserStats => {
    return "waitingReviews" in stats && "currentLevel" in stats;
  };

  return {
    stats,
    isLoading,
    error,
    isAdminStats,
    isUserStats,
  };
};
