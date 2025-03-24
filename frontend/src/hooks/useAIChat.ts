// src/hooks/useAIChat.ts
import { useState, useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import { useAuth } from "@/contexts/AuthContext";

// メッセージの型定義
export interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  isStreaming?: boolean; // ストリーミング中かどうかのフラグを追加
}

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

// フックのオプション型定義
interface UseAIChatOptions {
  reviewId: number;
  context?: ChatContext;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

// カスタムフック
export const useAIChat = ({
  reviewId,
  context = {},
  onSuccess,
  onError,
}: UseAIChatOptions) => {
  // ステート
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();
  const { updateLocalUsageCount, getUsageInfo } = useUsageLimit();

  // 現在ストリーミング中のメッセージIDを追跡する参照
  const streamingMessageId = useRef<string | null>(null);

  // 累積されたテキストを保持する参照
  const accumulatedText = useRef<string>("");

  // 初期メッセージを追加
  const addInitialMessage = useCallback((content: string) => {
    const aiMessage: Message = {
      id: uuidv4(),
      content,
      sender: "ai",
    };
    setMessages([aiMessage]);
  }, []);

  // メッセージの送信
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      try {
        // 利用状況を取得
        const usageInfo = getUsageInfo("ai_chat");

        // ユーザーメッセージをステートに追加
        const userMessage: Message = {
          id: uuidv4(),
          content,
          sender: "user",
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        // ストリーミング中のメッセージIDとテキストをリセット
        streamingMessageId.current = null;
        accumulatedText.current = "";

        // 利用状況をローカルで即時更新（楽観的更新）
        if (usageInfo) {
          updateLocalUsageCount("ai_chat", {
            used: usageInfo.used + 1,
            remaining: Math.max(0, usageInfo.remaining - 1),
            canUse: usageInfo.remaining > 1,
          });
        }

        // API リクエスト
        // 通常のストリーミングリクエスト
        await handleStreamingRequest(content);

        // 成功コールバック
        if (onSuccess) onSuccess();
      } catch (error) {
        console.error("Error sending message:", error);

        // AIのエラーメッセージを追加
        const errorMessage: Message = {
          id: uuidv4(),
          content:
            error instanceof Error
              ? `エラーが発生しました: ${error.message}`
              : "エラーが発生しました。もう一度お試しください。",
          sender: "ai",
        };

        setMessages((prev) => [...prev, errorMessage]);

        // エラーコールバック
        if (onError) onError(error);
      } finally {
        // ストリーミング完了後に確実にローディング状態を解除
        setIsLoading(false);
        // ストリーミングフラグをクリア
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId.current
              ? { ...msg, isStreaming: false }
              : msg
          )
        );

        // 参照をクリア
        streamingMessageId.current = null;
      }
    },
    [reviewId, context, updateLocalUsageCount, getUsageInfo, onSuccess, onError]
  );

  // 通常のストリーミングリクエスト処理
  const handleStreamingRequest = async (content: string) => {
    try {
      // リクエストの作成
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/ai-chat/message/stream`,
        {
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
        }
      );

      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status} ${response.statusText}`);
      }

      // レスポンスをテキストとして扱う
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("レスポンスボディが読み取れません");
      }

      // 新しいAIメッセージを作成
      const aiMessageId = uuidv4();
      streamingMessageId.current = aiMessageId;

      // メッセージをステートに追加（ストリーミングフラグをtrueに設定）
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          content: "",
          sender: "ai",
          isStreaming: true, // ストリーミング中のフラグ
        },
      ]);

      // テキスト処理用
      let decoder = new TextDecoder();
      accumulatedText.current = "";

      // 更新のスロットリング用
      let lastUpdateTime = 0;
      const updateThreshold = 50; // ミリ秒単位の更新閾値

      // ストリーミング処理
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // 新しいチャンクをデコード
        const chunk = decoder.decode(value, { stream: true });

        // 累積テキストに追加
        accumulatedText.current += chunk;

        // 現在の時刻
        const now = Date.now();

        // 最後の更新から閾値以上経過しているか、最初のチャンクなら更新
        if (
          now - lastUpdateTime >= updateThreshold ||
          accumulatedText.current.length <= chunk.length
        ) {
          // メッセージを更新
          updateMessageContent(aiMessageId, accumulatedText.current);
          lastUpdateTime = now;

          // 最初の有効なチャンクを受け取ったらローディング状態を変更開始
          if (accumulatedText.current.trim().length > 0 && isLoading) {
            setTimeout(() => setIsLoading(false), 100);
          }
        }
      }

      // 最終的な内容で更新
      updateMessageContent(aiMessageId, accumulatedText.current, false);
    } catch (error) {
      console.error("Streaming request error:", error);
      throw error;
    }
  };

  // メッセージ内容の更新を最適化するヘルパー関数
  const updateMessageContent = (
    messageId: string,
    content: string,
    isStillStreaming = true
  ) => {
    setMessages((prev) => {
      // IDがすでに存在するかチェック
      const messageExists = prev.some((msg) => msg.id === messageId);

      if (messageExists) {
        // 既存のメッセージを更新
        return prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content, isStreaming: isStillStreaming }
            : msg
        );
      } else {
        // 万が一メッセージが見つからない場合は追加
        return [
          ...prev,
          {
            id: messageId,
            content,
            sender: "ai",
            isStreaming: isStillStreaming,
          },
        ];
      }
    });
  };

  // メッセージのリセット
  const resetMessages = useCallback(() => {
    setMessages([]);
    streamingMessageId.current = null;
    accumulatedText.current = "";
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    addInitialMessage,
    resetMessages,
  };
};
