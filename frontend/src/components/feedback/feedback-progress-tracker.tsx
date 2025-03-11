// frontend/src/components/feedback/feedback-progress-tracker.tsx
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertCircle } from "lucide-react";

interface FeedbackProgressTrackerProps {
  totalCount: number;
  resolvedCount: number;
}

export function FeedbackProgressTracker({
  totalCount,
  resolvedCount,
}: FeedbackProgressTrackerProps) {
  // 進捗率を計算（0-100）
  const progressPercentage =
    totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  // 状態に応じたスタイルとメッセージを取得
  const getStatusStyle = () => {
    if (progressPercentage === 100) {
      return {
        textColor: "text-green-700",
        bgColor: "bg-green-100",
        borderColor: "border-green-200",
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        message: "すべてのフィードバックに対応しました",
      };
    } else if (progressPercentage > 50) {
      return {
        textColor: "text-blue-700",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        icon: <CheckCircle className="h-5 w-5 text-blue-600" />,
        message: "対応が進んでいます",
      };
    } else {
      return {
        textColor: "text-amber-700",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
        icon: <AlertCircle className="h-5 w-5 text-amber-500" />,
        message: "未対応のフィードバックがあります",
      };
    }
  };

  const statusStyle = getStatusStyle();

  return (
    <div
      className={`p-4 rounded-md border ${statusStyle.borderColor} ${statusStyle.bgColor}`}
    >
      <div className="flex items-center mb-2">
        {statusStyle.icon}
        <h3 className={`ml-2 font-medium ${statusStyle.textColor}`}>
          フィードバック対応状況
        </h3>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>
            {resolvedCount} / {totalCount} 対応済み
          </span>
          <span>{progressPercentage}%</span>
        </div>
        <Progress value={progressPercentage} />

        <p className={`text-sm ${statusStyle.textColor} mt-2`}>
          {statusStyle.message}
        </p>
      </div>
    </div>
  );
}
