// frontend/src/components/usage/UsageLimitBadge.tsx (修正版)
"use client";

import { useUsageLimit } from "@/contexts/UsageLimitContext";
import { useEffect, useState } from "react";
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

export function UsageLimitBadge({
  featureKey,
  showLabel = false,
}: UsageLimitBadgeProps) {
  const { getUsageInfo, isLoading, refreshUsageLimits } = useUsageLimit();
  const [refreshCounter, setRefreshCounter] = useState(0);

  // 定期的に利用状況を更新
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCounter((prev) => prev + 1);
    }, 60000); // 1分ごとに更新

    return () => clearInterval(timer);
  }, []);

  // カウンターが変わったら利用状況を更新
  useEffect(() => {
    refreshUsageLimits();
  }, [refreshCounter, refreshUsageLimits]);

  const usageInfo = getUsageInfo(featureKey);

  if (isLoading) {
    return (
      <div className="flex items-center text-xs text-gray-500 animate-pulse">
        <BatteryCharging className="h-4 w-4 mr-1" />
        {showLabel && <span>読込中...</span>}
      </div>
    );
  }

  if (!usageInfo) {
    return null;
  }

  // 残り回数から表示するアイコンとスタイルを決定
  const getIconAndStyle = () => {
    const { remaining, limit } = usageInfo;
    const ratio = remaining / limit;

    if (ratio > 0.7) {
      return {
        icon: <Battery className="h-4 w-4" />,
        colorClass: "text-green-600",
        label: "十分残っています",
      };
    } else if (ratio > 0.3) {
      return {
        icon: <BatteryMedium className="h-4 w-4" />,
        colorClass: "text-blue-600",
        label: "残りわずかです",
      };
    } else if (ratio > 0) {
      return {
        icon: <BatteryLow className="h-4 w-4" />,
        colorClass: "text-yellow-600",
        label: "もうすぐ制限に達します",
      };
    } else {
      return {
        icon: <BatteryWarning className="h-4 w-4" />,
        colorClass: "text-red-600",
        label: "本日の利用制限に達しました",
      };
    }
  };

  const { icon, colorClass, label } = getIconAndStyle();

  // 機能名を日本語に変換
  const getFeatureName = () => {
    switch (featureKey) {
      case "code_review":
        return "AIコードレビュー";
      case "ai_chat":
        return "AIチャット";
      default:
        return featureKey;
    }
  };

  const badgeContent = (
    <div className={`flex items-center text-xs ${colorClass}`}>
      {icon}
      {showLabel && (
        <span className="ml-1">
          残り{usageInfo.remaining}/{usageInfo.limit}回
        </span>
      )}
    </div>
  );

  const tooltipContent = (
    <div className="text-sm">
      <p className="font-semibold">{getFeatureName()}の利用制限</p>
      <p>
        本日の残り回数: {usageInfo.remaining}/{usageInfo.limit}回
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
}
