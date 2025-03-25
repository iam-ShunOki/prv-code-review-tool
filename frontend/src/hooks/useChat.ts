// frontend/src/hooks/useChat.ts
import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChatHistory, ChatMessage } from "./useChatHistory";

// メッセージのコンテキスト型定義
export type ChatContext = {
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
};

// useChat フックの戻り値の型
type UseChatReturn = {
  messages: ChatMessage[];
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  resetChat: () => void;
};

/**
 * チャット機能を提供するカスタムフック
 */
export const useChat = (
  reviewId?: number,
  context?: ChatContext
): UseChatReturn => {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // チャット履歴フックを使用
  const { messages, fetchChatHistory } = useChatHistory(reviewId);

  // メッセージを送信する関数
  const sendMessage = useCallback(
    async (message: string) => {
      if (!token) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chat/message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              message,
              reviewId,
              context,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "メッセージの送信に失敗しました"
          );
        }

        // 送信後に履歴を再取得
        await fetchChatHistory();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "エラーが発生しました";
        setError(errorMessage);
        console.error("メッセージ送信エラー:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [token, reviewId, context, fetchChatHistory]
  );

  // チャットをリセットする関数
  const resetChat = useCallback(() => {
    // ここではリセットをサポートしない (履歴は保持する)
    // 必要があれば、ローカルのmessagesをクリアするか、
    // バックエンドAPIでチャット履歴を削除する機能を実装可能
    setError(null);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    resetChat,
  };
};
