// frontend/src/hooks/useLearningChat.ts
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type ChatMode = "general" | "code-review" | "debugging";

export interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  created_at: Date | string;
  sessionId?: string;
}

interface UseLearningChatProps {
  initialSessionId?: string;
}

export const useLearningChat = (initialSessionId?: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    initialSessionId ||
      `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  );
  const { token } = useAuth();

  // メッセージの送信処理
  const sendMessage = useCallback(
    async (
      message: string,
      mode: ChatMode = "general",
      sessionId: string = currentSessionId
    ) => {
      if (!message.trim()) return;

      try {
        setIsLoading(true);
        setError(null);

        // ユーザーメッセージをローカルステートに追加
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          content: message,
          sender: "user",
          created_at: new Date(),
          sessionId: sessionId,
        };

        setMessages((prev) => [...prev, userMessage]);

        // APIリクエスト
        const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/learning-chat/message`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message,
            chatMode: mode,
            sessionId: sessionId,
            context: {
              isLearningMode: true,
              preferReferences: true,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "メッセージの送信に失敗しました"
          );
        }

        const data = await response.json();

        if (data.success) {
          // AIの応答をローカルステートに追加
          const aiMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            content: data.data.message,
            sender: "ai",
            created_at: new Date(),
            sessionId: sessionId,
          };

          setMessages((prev) => [...prev, aiMessage]);
        } else {
          throw new Error(data.message || "応答の取得に失敗しました");
        }
      } catch (err) {
        console.error("メッセージ送信エラー:", err);
        setError(
          err instanceof Error ? err.message : "不明なエラーが発生しました"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [token, currentSessionId]
  );

  // チャット履歴の取得
  const fetchChatHistory = useCallback(async () => {
    try {
      // APIからチャット履歴を取得
      const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/learning-chat/sessions`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("チャット履歴の取得に失敗しました");
      }

      const data = await response.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error("チャット履歴取得エラー:", err);
      setError(
        err instanceof Error ? err.message : "チャット履歴の取得に失敗しました"
      );
      return [];
    }
  }, [token]);

  // 特定のチャットセッションを読み込む
  const loadChatSession = useCallback(
    async (sessionId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        // セッションIDを更新
        setCurrentSessionId(sessionId);

        // 特定セッションのメッセージを取得
        // セッションのメッセージを取得
        const params = new URLSearchParams({ sessionId });
        const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/learning-chat/messages?${params}`;
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("チャットメッセージの取得に失敗しました");
        }

        const data = await response.json();

        if (data.success) {
          // メッセージを日付でソート
          const sortedMessages = data.data.sort((a: any, b: any) => {
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          });

          // メッセージをフォーマット
          const formattedMessages: ChatMessage[] = sortedMessages.map(
            (msg: any) => ({
              id: msg.id,
              content: msg.content,
              sender: msg.sender,
              created_at: new Date(msg.created_at),
              sessionId: msg.session_id,
            })
          );

          setMessages(formattedMessages);
        } else {
          throw new Error(data.message || "メッセージの取得に失敗しました");
        }
      } catch (err) {
        console.error("チャットセッション読み込みエラー:", err);
        setError(
          err instanceof Error
            ? err.message
            : "チャットセッションの読み込みに失敗しました"
        );
        // エラー時はメッセージを空にする
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  // チャットのリセット
  const resetChat = useCallback(async (newSessionId?: string) => {
    try {
      // 新しいセッションIDを設定（指定がなければ自動生成）
      const sessionId =
        newSessionId ||
        `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      setCurrentSessionId(sessionId);

      // メッセージをクリア
      setMessages([]);
      setError(null);

      return sessionId;
    } catch (err) {
      console.error("チャットリセットエラー:", err);
      setError(
        err instanceof Error ? err.message : "チャットのリセットに失敗しました"
      );
      throw err;
    }
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    isLoading,
    setIsLoading,
    error,
    resetChat,
    fetchChatHistory,
    loadChatSession,
    currentSessionId,
  };
};
