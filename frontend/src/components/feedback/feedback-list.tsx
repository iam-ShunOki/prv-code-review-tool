// frontend/src/components/feedback/feedback-list.tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { FeedbackDialog } from "./feedback-dialog";

interface Feedback {
  id: number;
  submission_id: number;
  problem_point: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
  line_number: number | null;
  created_at: string;
}

interface FeedbackListProps {
  feedbacks: Feedback[];
  showResolved?: boolean;
  onMarkResolved?: (feedbackId: number, resolved: boolean) => void;
  resolvedFeedbacks?: number[];
  readOnly?: boolean;
}

export function FeedbackList({
  feedbacks,
  showResolved = false,
  onMarkResolved,
  resolvedFeedbacks = [],
  readOnly = false,
}: FeedbackListProps) {
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  // 優先度に基づいてフィードバックをソート
  const sortedFeedbacks = [...feedbacks].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // 対応済みのフィードバックかどうかをチェック
  const isResolved = (feedbackId: number) => {
    return resolvedFeedbacks.includes(feedbackId);
  };

  const openFeedbackDialog = (feedback: Feedback) => {
    setSelectedFeedback(feedback);
    setDialogOpen(true);
  };

  const closeFeedbackDialog = () => {
    setDialogOpen(false);
  };

  // 優先度に基づくアイコンの設定
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "medium":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "low":
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  // 優先度に基づくスタイルの設定
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-red-200 hover:border-red-300";
      case "medium":
        return "border-amber-200 hover:border-amber-300";
      case "low":
        return "border-blue-200 hover:border-blue-300";
      default:
        return "border-gray-200 hover:border-gray-300";
    }
  };

  return (
    <div className="space-y-3">
      {sortedFeedbacks.length === 0 ? (
        <div className="text-center py-8 border rounded-md bg-gray-50">
          <p className="text-gray-500">フィードバックはありません</p>
        </div>
      ) : (
        sortedFeedbacks.map((feedback) => {
          const resolved = isResolved(feedback.id);

          // 対応済みのフィードバックを表示しない場合はスキップ
          if (!showResolved && resolved) {
            return null;
          }

          return (
            <Card
              key={feedback.id}
              className={`p-3 cursor-pointer border transition-colors ${getPriorityStyle(
                feedback.priority
              )} ${resolved ? "bg-gray-50 opacity-70" : ""}`}
              onClick={() => openFeedbackDialog(feedback)}
            >
              <div className="flex justify-between">
                <div className="flex items-start">
                  <div className="mt-0.5 mr-2">
                    {getPriorityIcon(feedback.priority)}
                  </div>
                  <div>
                    <h5
                      className={`font-medium ${
                        resolved ? "line-through text-gray-500" : ""
                      }`}
                    >
                      {feedback.problem_point}
                    </h5>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {feedback.suggestion}
                    </p>
                    {feedback.line_number && (
                      <p className="text-xs text-gray-400 mt-1">
                        該当行: {feedback.line_number}
                      </p>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <div className="ml-2 flex-shrink-0">
                    {resolved ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <div
                        className={`text-xs px-2 py-1 rounded ${
                          feedback.priority === "high"
                            ? "bg-red-100 text-red-600"
                            : feedback.priority === "medium"
                            ? "bg-amber-100 text-amber-600"
                            : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        {feedback.priority === "high"
                          ? "高"
                          : feedback.priority === "medium"
                          ? "中"
                          : "低"}
                        優先
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}

      {/* フィードバック詳細ダイアログ */}
      <FeedbackDialog
        feedback={
          selectedFeedback
            ? {
                ...selectedFeedback,
                is_resolved: isResolved(selectedFeedback.id),
              }
            : null
        }
        isOpen={dialogOpen}
        onClose={closeFeedbackDialog}
        onMarkResolved={onMarkResolved}
        isResolved={selectedFeedback ? isResolved(selectedFeedback.id) : false}
        readOnly={readOnly}
      />
    </div>
  );
}
