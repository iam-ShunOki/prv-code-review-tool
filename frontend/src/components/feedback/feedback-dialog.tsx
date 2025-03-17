// frontend/src/components/feedback/feedback-dialog.tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  ExternalLink,
} from "lucide-react";

interface Feedback {
  id: number;
  submission_id: number;
  problem_point: string;
  suggestion: string;
  reference_url?: string; // 参考URLフィールドを追加
  priority: "high" | "medium" | "low";
  line_number: number | null;
  created_at: string;
}

interface FeedbackDialogProps {
  feedback: Feedback | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkResolved?: (feedbackId: number, resolved: boolean) => void;
  isResolved?: boolean;
  readOnly?: boolean;
}

export function FeedbackDialog({
  feedback,
  isOpen,
  onClose,
  onMarkResolved,
  isResolved = false,
  readOnly = false,
}: FeedbackDialogProps) {
  const [localResolved, setLocalResolved] = useState(isResolved);

  if (!feedback) {
    return null;
  }

  // 優先度に基づくアイコンとカラーの設定
  const getPriorityIcon = () => {
    switch (feedback.priority) {
      case "high":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "medium":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "low":
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <Info className="h-5 w-5 text-gray-500" />;
    }
  };

  const getPriorityColor = () => {
    switch (feedback.priority) {
      case "high":
        return "text-red-700 bg-red-50 border-red-200";
      case "medium":
        return "text-amber-700 bg-amber-50 border-amber-200";
      case "low":
        return "text-blue-700 bg-blue-50 border-blue-200";
      default:
        return "text-gray-700 bg-gray-50 border-gray-200";
    }
  };

  const getPriorityText = () => {
    switch (feedback.priority) {
      case "high":
        return "高優先度";
      case "medium":
        return "中優先度";
      case "low":
        return "低優先度";
      default:
        return feedback.priority;
    }
  };

  const handleResolvedToggle = () => {
    setLocalResolved(!localResolved);
    if (onMarkResolved) {
      onMarkResolved(feedback.id, !localResolved);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center">
            {getPriorityIcon()}
            <DialogTitle className="ml-2">フィードバック詳細</DialogTitle>
          </div>
          <DialogDescription>
            フィードバックの詳細情報と対応方法を確認できます
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 問題点 */}
          <div>
            <h3 className="text-sm font-medium mb-1">問題点</h3>
            <div className={`p-3 rounded border ${getPriorityColor()}`}>
              <div className="flex items-center">
                <span className="inline-block px-2 py-1 text-xs rounded-full mr-2 font-medium bg-white bg-opacity-50">
                  {getPriorityText()}
                </span>
                <p className="font-medium">{feedback.problem_point}</p>
              </div>
              {feedback.line_number && (
                <p className="text-xs mt-1 text-right">
                  該当行: {feedback.line_number}
                </p>
              )}
            </div>
          </div>

          {/* ヒント */}
          <div>
            <h3 className="text-sm font-medium mb-1">学習のヒント</h3>
            <div className="p-3 rounded border bg-gray-50">
              <p className="whitespace-pre-line">{feedback.suggestion}</p>
            </div>
          </div>

          {/* 参考URL - 新しく追加 */}
          {feedback.reference_url && (
            <div>
              <h3 className="text-sm font-medium mb-1">参考資料</h3>
              <div className="p-3 rounded border bg-blue-50">
                <a
                  href={feedback.reference_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  ドキュメントを確認する
                </a>
              </div>
            </div>
          )}

          {/* 対応状況 */}
          {/* {!readOnly && onMarkResolved && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <CheckCircle
                  className={`h-5 w-5 mr-2 ${
                    localResolved ? "text-green-500" : "text-gray-300"
                  }`}
                />
                <span className="text-sm">
                  {localResolved ? "対応済み" : "未対応"}
                </span>
              </div>
              <Button
                variant={localResolved ? "outline" : "default"}
                size="sm"
                onClick={handleResolvedToggle}
              >
                {localResolved ? "未対応にする" : "対応済みにする"}
              </Button>
            </div>
          )} */}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
