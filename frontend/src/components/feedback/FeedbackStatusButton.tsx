// frontend/src/components/feedback/FeedbackStatusButton.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Circle } from "lucide-react";

interface FeedbackStatusButtonProps {
  feedbackId: number;
  initialStatus: boolean;
  onStatusChange: (id: number, status: boolean) => void;
  disabled?: boolean;
}

export function FeedbackStatusButton({
  feedbackId,
  initialStatus,
  onStatusChange,
  disabled = false,
}: FeedbackStatusButtonProps) {
  const [isResolved, setIsResolved] = useState<boolean>(initialStatus);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const { token } = useAuth();
  const { toast } = useToast();

  const handleStatusToggle = async () => {
    if (disabled || isUpdating) return;

    setIsUpdating(true);
    try {
      const newStatus = !isResolved;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/feedback/${feedbackId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_resolved: newStatus }),
        }
      );

      if (!response.ok) {
        throw new Error("ステータスの更新に失敗しました");
      }

      setIsResolved(newStatus);
      onStatusChange(feedbackId, newStatus);

      toast({
        title: newStatus ? "対応済みにしました" : "未対応に戻しました",
        duration: 2000,
      });
    } catch (error) {
      console.error("ステータス更新エラー:", error);
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error
            ? error.message
            : "ステータスの更新中にエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      variant={isResolved ? "default" : "outline"}
      size="sm"
      onClick={handleStatusToggle}
      disabled={disabled || isUpdating}
      className={`flex items-center ${
        isResolved ? "bg-green-500 hover:bg-green-600" : ""
      }`}
    >
      {isResolved ? (
        <>
          <CheckCircle className="h-4 w-4 mr-1" /> 対応済み
        </>
      ) : (
        <>
          <Circle className="h-4 w-4 mr-1" /> 未対応
        </>
      )}
      {isUpdating && (
        <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
    </Button>
  );
}
