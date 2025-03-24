// frontend/src/hooks/useAIChat.tsx
import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import { useAuth } from "@/contexts/AuthContext";

// メッセージタイプの定義
export type Message = {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
};

// チャットコンテキストの型定義
export type ChatContext = {
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
};

type UseAIChatProps = {
  reviewId: number;
  context?: ChatContext;
  onError?: (error: any) => void;
  onSuccess?: (response: any) => void;
};

export const useAIChat = ({
  reviewId,
  context,
  onError,
  onSuccess,
}: UseAIChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();
  const { updateLocalUsageCount } = useUsageLimit();

  // 初期メッセージを追加
  const addInitialMessage = useCallback((content: string) => {
    const message: Message = {
      id: uuidv4(),
      content,
      sender: "ai",
      timestamp: new Date(),
    };
    setMessages([message]);
  }, []);

  // メッセージを送信
  const sendMessage = useCallback(
    async (content: string) => {
      // 空メッセージは送信しない
      if (!content.trim()) return;

      // ユーザーメッセージを追加
      const userMessage: Message = {
        id: uuidv4(),
        content,
        sender: "user",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        // 使用状況を記録
        const usageInfo = useUsageLimit().getUsageInfo("ai_chat");
        if (usageInfo) {
          updateLocalUsageCount("ai_chat", {
            used: usageInfo.used + 1,
            remaining: Math.max(0, usageInfo.remaining - 1),
            canUse: usageInfo.remaining > 1,
          });
        }

        // ストリーミングAPIリクエストの準備
        const url = `${process.env.NEXT_PUBLIC_API_URL}/api/ai-chat/message/stream`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reviewId,
            message: content,
            context,
          }),
        });

        if (!response.ok) {
          throw new Error("APIリクエストに失敗しました");
        }

        if (!response.body) {
          throw new Error("レスポンスのボディがありません");
        }

        // ストリーミングレスポンスを処理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // AIのメッセージID
        const aiMessageId = uuidv4();

        // 空のAIメッセージを先に追加
        setMessages((prev) => [
          ...prev,
          {
            id: aiMessageId,
            content: "",
            sender: "ai",
            timestamp: new Date(),
          },
        ]);

        let accumulatedContent = "";

        const processStream = async () => {
          try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              // 受信したチャンクをデコード
              const chunk = decoder.decode(value, { stream: true });
              accumulatedContent += chunk;

              // AIメッセージを更新
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: accumulatedContent }
                    : msg
                )
              );
            }

            // 完了時に成功コールバック
            if (onSuccess) {
              onSuccess({ content: accumulatedContent });
            }
          } catch (streamError) {
            console.error("Stream processing error:", streamError);
            if (onError) {
              onError(streamError);
            }
          } finally {
            setIsLoading(false);
          }
        };

        // ストリーム処理開始
        processStream();
      } catch (error) {
        console.error("AI Chat error:", error);

        // エラーメッセージをチャットに表示
        const errorMessage: Message = {
          id: uuidv4(),
          content:
            "申し訳ありません、エラーが発生しました。もう一度お試しください。",
          sender: "ai",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);

        if (onError) {
          onError(error);
        }
      }
    },
    [reviewId, context, updateLocalUsageCount, onError, onSuccess]
  );

  // メッセージをリセット
  const resetMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    addInitialMessage,
    resetMessages,
  };
};

export default useAIChat;
