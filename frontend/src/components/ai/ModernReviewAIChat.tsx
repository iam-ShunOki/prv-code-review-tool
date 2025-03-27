// frontend/src/components/ai/ModernReviewAIChat.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  Send,
  User,
  RefreshCw,
  Trash2,
  Paperclip,
  Code,
  Loader2,
} from "lucide-react";
import ReactMarkdown, { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import remarkGfm from "remark-gfm";
import { v4 as uuidv4 } from "uuid";
import { UsageLimitBadge } from "@/components/usage/UsageLimitBadge";
import { useUsageLimit } from "@/contexts/UsageLimitContext";

// メッセージタイプの定義
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ModernReviewAIChatProps {
  reviewId: number;
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
}

export default function ModernReviewAIChat({
  reviewId,
  reviewTitle,
  codeContent,
  feedbacks,
}: ModernReviewAIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [isFirstMessage, setIsFirstMessage] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();
  const { toast } = useToast();
  const { canUseFeature, refreshUsageLimits } = useUsageLimit();

  // チャット利用可能かどうかをチェック
  const canUseChat = canUseFeature("ai_chat");

  // 初期化時にセッションIDを生成
  useEffect(() => {
    setSessionId(`session-${reviewId}-${Date.now()}`);
  }, [reviewId]);

  // セッションが変更されたときにチャット履歴を読み込む
  useEffect(() => {
    if (sessionId && token) {
      fetchChatHistory();
    }
  }, [sessionId, token]);

  // スクロールを最新メッセージに合わせる
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // チャット履歴を取得
  const fetchChatHistory = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chat/history?sessionId=${sessionId}`,
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

      if (data.success && data.data) {
        // APIレスポンスからメッセージ配列に変換
        const historyMessages = data.data.map((msg: any) => ({
          id: msg.id || uuidv4(),
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));

        setMessages(historyMessages);

        // 履歴があれば初回メッセージフラグをオフに
        if (historyMessages.length > 0) {
          setIsFirstMessage(false);
        }
      }
    } catch (error) {
      console.error("チャット履歴取得エラー:", error);
    }
  };

  // メッセージを送信
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // チャット利用権限をチェック
    if (!canUseChat) {
      toast({
        title: "利用制限に達しました",
        description:
          "本日のAIチャット利用回数の上限に達しました。明日以降に再度お試しください。",
        variant: "destructive",
      });
      return;
    }

    // ユーザーメッセージをUIに追加
    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // AIアシスタントに応答を要求
      await sendToAIAssistant(input);

      // 初回メッセージフラグをオフに
      if (isFirstMessage) {
        setIsFirstMessage(false);
      }

      // 利用制限を更新
      await refreshUsageLimits();
    } catch (error) {
      console.error("AIアシスタントエラー:", error);

      // エラーメッセージを表示
      const errorMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content:
          "メッセージの処理中にエラーが発生しました。もう一度お試しください。",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);

      toast({
        title: "エラーが発生しました",
        description: "AIアシスタントとの通信に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ストリーミングAPIを使用してAIアシスタントに送信
  const sendToAIAssistant = async (userMessage: string) => {
    try {
      // ストリーミングAPIのレスポンスを処理するためのReader
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/ai-chat/message/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: userMessage,
            reviewId: reviewId,
            sessionId: sessionId,
            context: {
              reviewTitle,
              codeContent,
              feedbacks,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "AIとの通信に失敗しました");
      }

      // レスポンスをストリームとして処理
      const reader = response.body?.getReader();
      if (!reader) throw new Error("レスポンスボディを読み取れません");

      // AIの応答メッセージを作成
      const aiMessageId = uuidv4();
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);

      // ストリームからチャンクを読み取り、メッセージを更新
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if (value) {
          const chunkText = decoder.decode(value);

          // メッセージを更新
          setMessages((prev) => {
            const newMessages = [...prev];
            const aiMessageIndex = newMessages.findIndex(
              (msg) => msg.id === aiMessageId
            );

            if (aiMessageIndex !== -1) {
              newMessages[aiMessageIndex] = {
                ...newMessages[aiMessageIndex],
                content: newMessages[aiMessageIndex].content + chunkText,
              };
            }

            return newMessages;
          });
        }
      }
    } catch (error) {
      console.error("AIストリーミングエラー:", error);
      throw error;
    }
  };

  // チャットをクリア
  const handleClearChat = () => {
    if (isLoading) return;

    setMessages([]);
    setIsFirstMessage(true);
    setSessionId(`session-${reviewId}-${Date.now()}`);

    toast({
      title: "チャット履歴をクリアしました",
      description: "新しい会話を始めることができます",
    });
  };

  // キーボードショートカット
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl flex items-center">
          <Bot className="mr-2 h-5 w-5" />
          AIアシスタント
        </CardTitle>
        <div className="flex space-x-2">
          {!isFirstMessage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearChat}
              disabled={isLoading}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              クリア
            </Button>
          )}
          <UsageLimitBadge featureKey="ai_chat" showLabel />
        </div>
      </CardHeader>

      <CardContent>
        {/* メッセージ履歴表示エリア */}
        <div className="h-[350px] overflow-y-auto mb-4 p-4 bg-gray-50 rounded-lg">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
              {isFirstMessage ? (
                <>
                  <Bot className="h-10 w-10 mb-2" />
                  <p className="mb-1">AIアシスタントがお手伝いします</p>
                  <p className="text-sm">
                    コードやフィードバックに関する質問をしてみましょう
                  </p>
                </>
              ) : (
                <div className="animate-pulse">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p>メッセージを読み込み中...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-3/4 p-3 rounded-lg ${
                      message.role === "user"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-white border border-gray-200"
                    }`}
                  >
                    <div className="flex items-center mb-1">
                      <div className="mr-2">
                        {message.role === "user" ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="markdown-content">
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: (({
                              node,
                              inline,
                              className,
                              children,
                              ...props
                            }) => {
                              const match = /language-(\w+)/.exec(
                                className || ""
                              );
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, "")}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            }) as React.ComponentType<any>,
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 入力エリア */}
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="AI アシスタントに質問してください..."
            rows={2}
            disabled={isLoading || !canUseChat}
            className="min-h-[80px] pr-20"
          />
          <div className="absolute bottom-2 right-2 flex space-x-1">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              disabled={true}
              className="h-8 w-8 text-gray-400"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              disabled={true}
              className="h-8 w-8 text-gray-400"
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading || !canUseChat}
              size="icon"
              className="h-8 w-8"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* 使用上の注意 */}
        <div className="mt-2 text-xs text-gray-500">
          <p>
            AIアシスタントはレビュー内容に基づいて回答します。プライバシーに関わる質問や機密情報には回答できません。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
