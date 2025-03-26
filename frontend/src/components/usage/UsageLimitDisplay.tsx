// frontend/src/components/usage/UsageLimitDisplay.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Battery, MessageCircle, Code, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ユーザーのAI機能利用状況を表示するコンポーネント
 */
export function UsageLimitDisplay() {
  const { user } = useAuth();
  const { usageLimits, refreshUsageLimits, isLoading } = useUsageLimit();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 管理者かどうかをチェック
  const isAdmin = user?.role === "admin";

  // 初期表示と定期的な更新
  useEffect(() => {
    refreshUsageLimits();

    // 1分ごとに自動更新
    const timer = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, 60000);

    return () => clearInterval(timer);
  }, [refreshUsageLimits]);

  // カウンターが変わったら利用状況を更新
  useEffect(() => {
    refreshUsageLimits();
  }, [refreshTrigger, refreshUsageLimits]);

  // 機能のアイコンを取得
  const getFeatureIcon = (featureKey: string) => {
    switch (featureKey) {
      case "code_review":
        return <Code className="h-5 w-5 text-blue-600" />;
      case "ai_chat":
        return <MessageCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Battery className="h-5 w-5 text-gray-600" />;
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

  // 利用状況に基づく進捗バーのカラーを取得
  const getProgressColor = (used: number, limit: number) => {
    const ratio = (limit - used) / limit;

    if (ratio > 0.7) return "bg-green-500";
    if (ratio > 0.3) return "bg-blue-500";
    if (ratio > 0) return "bg-yellow-500";
    return "bg-red-500";
  };

  // 管理者の場合は表示しない
  if (isAdmin) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">利用状況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4 text-gray-500">
            <Battery className="h-5 w-5 mr-2" />
            <span>管理者は利用制限がありません</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ローディング中の表示
  if (isLoading || Object.keys(usageLimits).length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">利用状況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="animate-pulse flex space-x-4 items-center">
              <div className="rounded-full bg-gray-200 h-10 w-10"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
            <div className="animate-pulse flex space-x-4 items-center">
              <div className="rounded-full bg-gray-200 h-10 w-10"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 利用制限がない場合
  if (Object.keys(usageLimits).length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">利用状況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4 text-gray-500">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>利用可能な機能がありません</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">本日の利用状況</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(usageLimits).map(([featureKey, usage]) => (
            <div key={featureKey} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {getFeatureIcon(featureKey)}
                  <span className="ml-2 font-medium">
                    {getFeatureName(featureKey)}
                  </span>
                </div>
                <span className="text-sm">
                  {usage.used}/{usage.limit} 回使用
                </span>
              </div>
              <Progress
                value={(usage.used / usage.limit) * 100}
                className="h-2"
                indicatorColor={getProgressColor(usage.used, usage.limit)}
              />
              <div className="text-xs text-gray-500 mt-1">
                残り {usage.remaining} 回
                {usage.remaining === 0 && (
                  <span className="ml-1 text-red-500">
                    （制限に達しました）
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
