// frontend/src/components/usage/UsageLimitBadge.tsx (最適化版)
"use client";

import { useUsageLimit } from "@/contexts/UsageLimitContext";
import { useCallback, useEffect, useState, memo } from "react";
import {
  Battery,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
} from "lucide-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface UsageLimitBadgeProps {
  featureKey: string;
  showLabel?: boolean;
}

// React.memo でコンポーネントをメモ化
export const UsageLimitBadge = memo(function UsageLimitBadge({
  featureKey,
  showLabel = false,
}: UsageLimitBadgeProps) {
  const { getUsageInfo, isLoading } = useUsageLimit();
  const [counter, setCounter] = useState(0);

  // リフレッシュは必要なときだけに制限
  useEffect(() => {
    // コンポーネントマウント時に一度だけ更新タイマーをセット
    const timer = setInterval(() => {
      setCounter((prev) => prev + 1);
    }, 60000); // 1分ごとに内部カウンターを更新

    return () => clearInterval(timer);
  }, []);

  // 情報表示を計算 - useMemo相当の最適化
  const getDisplayInfo = useCallback(() => {
    const usageInfo = getUsageInfo(featureKey);

    if (!usageInfo) {
      return {
        icon: <BatteryCharging className="h-4 w-4" />,
        colorClass: "text-gray-400",
        label: "情報なし",
        remaining: 0,
        limit: 0,
      };
    }

    const { remaining, limit } = usageInfo;
    const ratio = remaining / limit;

    if (ratio > 0.7) {
      return {
        icon: <Battery className="h-4 w-4" />,
        colorClass: "text-green-600",
        label: "十分残っています",
        remaining,
        limit,
      };
    } else if (ratio > 0.3) {
      return {
        icon: <BatteryMedium className="h-4 w-4" />,
        colorClass: "text-blue-600",
        label: "残りわずかです",
        remaining,
        limit,
      };
    } else if (ratio > 0) {
      return {
        icon: <BatteryLow className="h-4 w-4" />,
        colorClass: "text-yellow-600",
        label: "もうすぐ制限に達します",
        remaining,
        limit,
      };
    } else {
      return {
        icon: <BatteryWarning className="h-4 w-4" />,
        colorClass: "text-red-600",
        label: "本日の利用制限に達しました",
        remaining,
        limit,
      };
    }
  }, [featureKey, getUsageInfo]);

  // 機能名を日本語に変換
  const getFeatureName = useCallback(() => {
    switch (featureKey) {
      case "code_review":
        return "AIコードレビュー";
      case "ai_chat":
        return "AIチャット";
      default:
        return featureKey;
    }
  }, [featureKey]);

  if (isLoading) {
    return (
      <div className="flex items-center text-xs text-gray-500 animate-pulse">
        <BatteryCharging className="h-4 w-4 mr-1" />
        {showLabel && <span>読込中...</span>}
      </div>
    );
  }

  const { icon, colorClass, label, remaining, limit } = getDisplayInfo();

  const badgeContent = (
    <div className={`flex items-center text-xs ${colorClass}`}>
      {icon}
      {showLabel && (
        <span className="ml-1">
          残り{remaining}/{limit}回
        </span>
      )}
    </div>
  );

  const tooltipContent = (
    <div className="text-sm">
      <p className="font-semibold">{getFeatureName()}の利用制限</p>
      <p>
        本日の残り回数: {remaining}/{limit}回
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{badgeContent}</div>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
