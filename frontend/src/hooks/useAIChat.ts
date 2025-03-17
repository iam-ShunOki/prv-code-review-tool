// frontend/src/hooks/useAIChat.ts
import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/contexts/AuthContext";
import { useUsageLimit } from "@/contexts/UsageLimitContext";

export interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
}

export interface ChatContext {
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
}

interface UseAIChatOptions {
  reviewId: number;
  context?: ChatContext;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
}

export function useAIChat({
  reviewId,
  context,
  onError,
  onSuccess,
}: UseAIChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();
  const { getRemainingUsage, usageLimits, refreshUsageLimits } =
    useUsageLimit();

  // 現在のAIチャットの残りカウント
  const aiChatRemaining = getRemainingUsage("ai_chat");

  // メッセージを追加
  const addMessage = useCallback(
    (content: string, sender: "user" | "assistant") => {
      const newMessage: Message = {
        id: uuidv4(),
        content,
        sender,
      };
      setMessages((prev) => [...prev, newMessage]);
      return newMessage;
    },
    []
  );

  // 初期メッセージを追加
  const addInitialMessage = useCallback(
    (content: string) => {
      return addMessage(content, "assistant");
    },
    [addMessage]
  );

  // ローカルでカウンターを更新する関数
  const decrementLocalCounter = useCallback(() => {
    // usageLimits内のaiChatオブジェクトを更新
    if (usageLimits.ai_chat) {
      const currentUsed = usageLimits.ai_chat.used;
      const currentLimit = usageLimits.ai_chat.limit;

      // ローカルで使用回数をインクリメント
      const newUsed = currentUsed + 1;
      const newRemaining = Math.max(0, currentLimit - newUsed);

      // コンテキストのローカル状態を更新（この変更はUIだけに影響し、次回のリフレッシュで上書きされる）
      // この関数はUsageLimitContextに追加する必要があります
      if (typeof (window as any).updateLocalUsageLimits === "function") {
        (window as any).updateLocalUsageLimits("ai_chat", {
          used: newUsed,
          remaining: newRemaining,
          limit: currentLimit,
          canUse: newRemaining > 0,
        });
      }
    }
  }, [usageLimits]);

  // メッセージを送信
  const sendMessage = useCallback(
    async (message: string) => {
      // ユーザーメッセージをUIに追加
      addMessage(message, "user");

      setIsLoading(true);

      try {
        // 送信前に先にローカルカウンターを減らす
        decrementLocalCounter();

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/ai-chat/message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reviewId,
              message,
              context,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "AI応答の取得に失敗しました");
        }

        const data = await response.json();

        // AIの応答をUIに追加
        addMessage(data.data.message, "assistant");

        // 成功コールバックがあれば実行
        if (onSuccess) {
          onSuccess();
        }

        // 最新の使用状況を反映するためにコンテキストを更新
        await refreshUsageLimits();
      } catch (error) {
        console.error("AI Chat error:", error);

        // エラーメッセージをUIに追加
        addMessage(
          "申し訳ありません、エラーが発生しました。もう一度お試しください。",
          "assistant"
        );

        // エラーコールバックがあれば実行
        if (onError && error instanceof Error) {
          onError(error);
        }

        // エラーの場合でも最新状態を取得
        await refreshUsageLimits();
      } finally {
        setIsLoading(false);
      }
    },
    [
      token,
      reviewId,
      context,
      addMessage,
      onError,
      onSuccess,
      decrementLocalCounter,
      refreshUsageLimits,
    ]
  );

  // メッセージをリセット
  const resetMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    addMessage,
    addInitialMessage,
    resetMessages,
    aiChatRemaining,
  };
}
