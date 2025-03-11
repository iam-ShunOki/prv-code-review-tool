// frontend/src/components/feedback/FeedbackProgress.tsx
"use client";

import { Progress } from "@/components/ui/progress";

interface FeedbackProgressProps {
  total: number;
  resolved: number;
}

export function FeedbackProgress({ total, resolved }: FeedbackProgressProps) {
  const progressPercentage =
    total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <p className="text-muted-foreground">対応状況</p>
        <p className="font-medium">
          {resolved}/{total} ({progressPercentage}%)
        </p>
      </div>
      <Progress
        value={progressPercentage}
        className="h-2"
        indicatorColor={progressPercentage === 100 ? "bg-green-500" : ""}
      />
      {progressPercentage === 100 && (
        <p className="text-xs text-green-600 font-medium">
          すべての項目に対応済みです！
        </p>
      )}
    </div>
  );
}
