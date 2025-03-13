// frontend/src/hooks/useAIChat.ts
import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";

// チャットメッセージの型定義
export type Message = {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
};

// コンテキストの型定義
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
}

export const useAIChat = ({ reviewId, context, onError }: UseAIChatOptions) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const { user, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // 初期メッセージを追加
  const addInitialMessage = useCallback((message: string) => {
    const initialMessage: Message = {
      id: "init-" + Date.now(),
      content: message,
      sender: "ai",
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
  }, []);

  // ユーザーメッセージを送信
  const sendMessage = useCallback(
    async (messageContent: string): Promise<void> => {
      if (!messageContent.trim() || isLoading) return;

      // ユーザーメッセージを追加
      const userMessage: Message = {
        id: "user-" + Date.now(),
        content: messageContent.trim(),
        sender: "user",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        // APIリクエスト送信
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/ai-chat/message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // 認証トークンをAuthコンテキストから取得するなど
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reviewId,
              message: messageContent.trim(),
              context,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("AIチャットAPIエラー");
        }

        const data = await response.json();

        // AIの応答をメッセージに追加
        const aiMessage: Message = {
          id: "ai-" + Date.now(),
          content:
            data.data?.message ||
            "申し訳ありません、適切な回答を生成できませんでした。",
          sender: "ai",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);
      } catch (error) {
        console.error("AI Chat error:", error);

        // エラーコールバックを呼び出し
        if (onError && error instanceof Error) {
          onError(error);
        }

        // エラーメッセージを表示
        toast({
          title: "エラー",
          description: "メッセージの送信中にエラーが発生しました",
          variant: "destructive",
        });

        // エラーメッセージを表示
        const errorMessage: Message = {
          id: "error-" + Date.now(),
          content: "すみません、エラーが発生しました。もう一度お試しください。",
          sender: "ai",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [reviewId, context, isLoading, onError, toast]
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
