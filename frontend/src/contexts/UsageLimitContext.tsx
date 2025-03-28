// frontend/src/contexts/UsageLimitContext.tsx (ローカル更新機能付き)
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "@/components/ui/use-toast";

// 利用状況の型定義
interface FeatureUsage {
  used: number;
  limit: number;
  remaining: number;
  canUse: boolean;
}

// コンテキストの型定義
interface UsageLimitContextType {
  usageLimits: {
    [key: string]: FeatureUsage;
  };
  isLoading: boolean;
  canUseFeature: (featureKey: string) => boolean;
  getRemainingUsage: (featureKey: string) => number;
  getUsageInfo: (featureKey: string) => FeatureUsage | null;
  refreshUsageLimits: () => Promise<void>;
  updateFeatureLimit: (
    featureKey: string,
    newLimit: number
  ) => Promise<boolean>;
  // 新しい関数: ローカルで利用状況を更新
  updateLocalUsageCount: (
    featureKey: string,
    usageInfo: Partial<FeatureUsage>
  ) => void;
}

// 初期値を設定
const defaultContext: UsageLimitContextType = {
  usageLimits: {},
  isLoading: true,
  canUseFeature: () => false,
  getRemainingUsage: () => 0,
  getUsageInfo: () => null,
  refreshUsageLimits: async () => {},
  updateFeatureLimit: async () => false,
  updateLocalUsageCount: () => {},
};

// コンテキストを作成
const UsageLimitContext = createContext<UsageLimitContextType>(defaultContext);

// カスタムフック
export const useUsageLimit = () => useContext(UsageLimitContext);

// プロバイダーコンポーネント
interface UsageLimitProviderProps {
  children: ReactNode;
}

export const UsageLimitProvider: React.FC<UsageLimitProviderProps> = ({
  children,
}) => {
  const [usageLimits, setUsageLimits] = useState<{
    [key: string]: FeatureUsage;
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const { token, user } = useAuth();
  const { toast } = useToast();

  // キャッシュとデバウンスのための状態
  const lastFetchTime = useRef<number>(0);
  const fetchPromise = useRef<Promise<void> | null>(null);
  const CACHE_DURATION = 30000; // 30秒

  // デバウンス済みのデータ取得関数
  const fetchUsageLimits = useCallback(
    async (force = false) => {
      if (!token) return;

      const now = Date.now();

      // キャッシュが有効かつ強制更新でない場合は早期リターン
      if (!force && now - lastFetchTime.current < CACHE_DURATION) {
        return;
      }

      // 既に進行中のリクエストがある場合はそれを使用
      if (fetchPromise.current) {
        return fetchPromise.current;
      }

      // リクエストを開始
      setIsLoading(true);

      // 新しいpromiseを作成
      fetchPromise.current = (async () => {
        try {
          // デフォルト値（APIが失敗した場合のフォールバック）
          const defaultLimits = {
            code_review: {
              used: 0,
              limit: 20,
              remaining: 20,
              canUse: true,
            },
            ai_chat: {
              used: 0,
              limit: 30,
              remaining: 30,
              canUse: true,
            },
          };

          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/api/usage-limits/my-usage`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                // キャッシュ制御
                cache: "no-cache",
              }
            );

            if (!response.ok) {
              console.warn(
                "利用制限の取得に失敗しました。デフォルト値を使用します。",
                await response.text()
              );
              setUsageLimits(defaultLimits);
              return;
            }

            const data = await response.json();
            if (data.success) {
              // データの検証: 必要なキーが存在するか確認
              if (!data.data || Object.keys(data.data).length === 0) {
                console.warn(
                  "APIが空のデータを返しました。デフォルト値を使用します。"
                );
                setUsageLimits(defaultLimits);
                return;
              }

              // 必須キーが存在するか確認し、なければデフォルト値を追加
              const resultData = { ...data.data };
              if (!resultData.code_review) {
                resultData.code_review = defaultLimits.code_review;
              }
              if (!resultData.ai_chat) {
                resultData.ai_chat = defaultLimits.ai_chat;
              }

              setUsageLimits(resultData);
            } else {
              console.warn(
                "APIがエラーを返しました。デフォルト値を使用します。",
                data.message
              );
              setUsageLimits(defaultLimits);
            }
          } catch (error) {
            console.error("利用制限のフェッチ中にエラーが発生しました:", error);
            setUsageLimits(defaultLimits);
          }
        } catch (error) {
          console.error("利用制限取得エラー:", error);

          // エラーが発生した場合でもUIが壊れないようにデフォルト値を設定
          setUsageLimits({
            code_review: {
              used: 0,
              limit: 20,
              remaining: 20,
              canUse: true,
            },
            ai_chat: {
              used: 0,
              limit: 30,
              remaining: 30,
              canUse: true,
            },
          });
        } finally {
          setIsLoading(false);
          lastFetchTime.current = Date.now();
          fetchPromise.current = null;
        }
      })();

      return fetchPromise.current;
    },
    [token, toast]
  );

  // 初回レンダリング時と認証トークンが変更されたときに制限を取得
  useEffect(() => {
    if (token) {
      fetchUsageLimits(true);
    }
  }, [token, fetchUsageLimits]);

  // グローバル関数として公開 (非推奨ですが互換性のために維持)
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).updateLocalUsageLimits = (
        featureKey: string,
        newInfo: Partial<FeatureUsage>
      ) => {
        updateLocalUsageCount(featureKey, newInfo);
      };
    }

    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).updateLocalUsageLimits;
      }
    };
  }, []);

  // 特定の機能が利用可能かどうかをチェック
  const canUseFeature = useCallback(
    (featureKey: string): boolean => {
      // 管理者の場合は常に利用可能
      if (user?.role === "admin") return true;

      // 該当機能の情報がなければfalseを返す
      if (!usageLimits[featureKey]) return false;

      return usageLimits[featureKey].canUse;
    },
    [usageLimits, user?.role]
  );

  // 特定の機能の残り利用回数を取得
  const getRemainingUsage = useCallback(
    (featureKey: string): number => {
      // 管理者の場合は999を返す（事実上無制限）
      if (user?.role === "admin") return 999;

      // 該当機能の情報がなければ0を返す
      if (!usageLimits[featureKey]) return 0;

      return usageLimits[featureKey].remaining;
    },
    [usageLimits, user?.role]
  );

  // 特定の機能の利用情報を取得
  const getUsageInfo = useCallback(
    (featureKey: string): FeatureUsage | null => {
      // 管理者の場合は特別な値を返す
      if (user?.role === "admin") {
        return {
          used: 0,
          limit: 999,
          remaining: 999,
          canUse: true,
        };
      }

      // 該当機能の情報がなければnullを返す
      if (!usageLimits[featureKey]) return null;

      return usageLimits[featureKey];
    },
    [usageLimits, user?.role]
  );

  // ローカルで利用状況を更新する関数 (新規追加)
  const updateLocalUsageCount = useCallback(
    (featureKey: string, newInfo: Partial<FeatureUsage>) => {
      // 管理者の場合は何もしない
      if (user?.role === "admin") return;

      setUsageLimits((prev) => {
        // 機能が存在しない場合は何もしない
        if (!prev[featureKey]) return prev;

        // 新しい情報で既存の情報を上書き
        return {
          ...prev,
          [featureKey]: {
            ...prev[featureKey],
            ...newInfo,
          },
        };
      });
    },
    [user?.role]
  );

  // 利用制限を更新
  const updateFeatureLimit = async (
    featureKey: string,
    newLimit: number
  ): Promise<boolean> => {
    // 管理者でなければ更新不可
    if (user?.role !== "admin" || !token) return false;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/usage-limits/${featureKey}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ daily_limit: newLimit }),
        }
      );

      if (!response.ok) {
        throw new Error("利用制限の更新に失敗しました");
      }

      // 更新が成功したら利用制限を再取得（強制更新）
      await fetchUsageLimits(true);

      toast({
        title: "利用制限を更新しました",
        description: `${featureKey}の1日の制限を${newLimit}回に設定しました`,
      });

      return true;
    } catch (error) {
      console.error("利用制限更新エラー:", error);

      toast({
        title: "エラーが発生しました",
        description: "利用制限の更新に失敗しました",
        variant: "destructive",
      });

      return false;
    }
  };

  // 公開用の refreshUsageLimits 関数 - デバウンスと制限あり
  const refreshUsageLimits = useCallback(async (): Promise<void> => {
    return fetchUsageLimits(false);
  }, [fetchUsageLimits]);

  // コンテキスト値の作成
  const value: UsageLimitContextType = {
    usageLimits,
    isLoading,
    canUseFeature,
    getRemainingUsage,
    getUsageInfo,
    refreshUsageLimits,
    updateFeatureLimit,
    updateLocalUsageCount,
  };

  return (
    <UsageLimitContext.Provider value={value}>
      {children}
    </UsageLimitContext.Provider>
  );
};
