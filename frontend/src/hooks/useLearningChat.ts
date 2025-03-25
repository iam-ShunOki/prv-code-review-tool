// frontend/src/hooks/useLearningChat.ts
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

// チャットメッセージの型定義
export type LearningChatMessage = {
  id: number;
  content: string;
  sender: "user" | "ai";
  created_at: string;
};

// チャットモードの定義
export type ChatMode = "general" | "code-review" | "debugging";

// useLearningChat フックの戻り値の型
type UseLearningChatReturn = {
  messages: LearningChatMessage[];
  sendMessage: (message: string, chatMode: ChatMode) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  resetChat: () => Promise<void>;
  fetchChatHistory: () => Promise<void>;
};

/**
 * 学習チャット機能を提供するカスタムフック
 */
export const useLearningChat = (): UseLearningChatReturn => {
  const { token } = useAuth();
  const [messages, setMessages] = useState<LearningChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState<boolean>(true);

  // チャット履歴を取得する関数
  const fetchChatHistory = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/learning-chat/history`,
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
      setInitialLoad(false);
    }
  }, [token]);

  // 初回マウント時にチャット履歴を取得
  useEffect(() => {
    if (token && initialLoad) {
      fetchChatHistory();
    }
  }, [token, fetchChatHistory, initialLoad]);

  // メッセージを送信する関数
  const sendMessage = useCallback(
    async (message: string, chatMode: ChatMode = "general") => {
      if (!token) return;

      setIsLoading(true);
      setError(null);

      // ユーザーメッセージをローカルに追加（即時表示のため）
      const userMessage: LearningChatMessage = {
        id: Date.now(),
        content: message,
        sender: "user",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/learning-chat/message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              message,
              chatMode,
              context: {
                isLearningMode: true,
                preferReferences: true,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "メッセージの送信に失敗しました"
          );
        }

        const data = await response.json();

        if (data.success) {
          // AIの応答メッセージを追加
          const aiMessage: LearningChatMessage = {
            id: Date.now() + 1,
            content: data.data.message,
            sender: "ai",
            created_at: new Date().toISOString(),
          };

          setMessages((prev) => [...prev, aiMessage]);
        } else {
          throw new Error(data.message || "エラーが発生しました");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "エラーが発生しました";
        setError(errorMessage);
        console.error("メッセージ送信エラー:", err);

        // エラーメッセージをチャットに追加
        const errorAiMessage: LearningChatMessage = {
          id: Date.now() + 1,
          content:
            "申し訳ありません。メッセージの送信中にエラーが発生しました。もう一度お試しください。",
          sender: "ai",
          created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, errorAiMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  // チャットをリセットする関数
  const resetChat = useCallback(async () => {
    setMessages([]);
    setError(null);

    // 新しい会話のための初期メッセージを追加
    const welcomeMessage: LearningChatMessage = {
      id: Date.now(),
      content: `# プログラミング学習アシスタントへようこそ！👋

こんにちは！私はプログラミング学習をサポートするAIアシスタントです。

**以下のようなことをお手伝いできます：**

- プログラミングの概念やテクニックの説明
- コードの問題解決のヒント提供
- 適切な学習リソースやドキュメントの紹介

質問は具体的であればあるほど、より的確なサポートができます。

_注意: 私は直接的な答えを提供するのではなく、あなた自身が学び、理解を深められるようサポートします。_

何か質問があれば、お気軽にどうぞ！`,
      sender: "ai",
      created_at: new Date().toISOString(),
    };

    setMessages([welcomeMessage]);

    return Promise.resolve();
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    resetChat,
    fetchChatHistory,
  };
};
