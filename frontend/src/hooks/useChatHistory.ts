// frontend/src/hooks/useChatHistory.ts
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

// チャットメッセージの型定義
export type ChatMessage = {
  id: number;
  content: string;
  sender: "user" | "ai";
  created_at: string;
};

// useChatHistory フックの戻り値の型
type UseChatHistoryReturn = {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  fetchChatHistory: (reviewId?: number) => Promise<void>;
};

/**
 * チャット履歴を取得・管理するカスタムフック
 */
export const useChatHistory = (reviewId?: number): UseChatHistoryReturn => {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // チャット履歴を取得する関数
  const fetchChatHistory = useCallback(
    async (specificReviewId?: number) => {
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        // リクエストパラメータの組み立て
        const reviewParam = specificReviewId || reviewId;
        const queryParams = reviewParam ? `?reviewId=${reviewParam}` : "";

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chat/history${queryParams}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("チャット履歴の取得に失敗しました");
        }

        const data = await response.json();

        if (data.success) {
          setMessages(data.data);
        } else {
          throw new Error(data.message || "データの取得に失敗しました");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "エラーが発生しました";
        setError(errorMessage);
        console.error("チャット履歴取得エラー:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [token, reviewId]
  );

  // 初回マウント時とレビューID変更時に履歴を取得
  useEffect(() => {
    if (token) {
      fetchChatHistory();
    }
  }, [token, fetchChatHistory]);

  return {
    messages,
    isLoading,
    error,
    fetchChatHistory,
  };
};
