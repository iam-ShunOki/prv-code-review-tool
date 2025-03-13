// frontend/src/components/ai/ReviewAIChat.tsx
import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, MinusCircle, Loader2 } from "lucide-react";
import { useAIChat, Message, ChatContext } from "@/hooks/useAIChat";

// コンポーネントのプロップス
type ReviewAIChatProps = {
  reviewId: number;
  reviewTitle?: string;
  codeContent?: string;
  feedbacks?: Array<{
    id: number;
    problem_point: string;
    suggestion: string;
    priority: string;
  }>;
};

const ReviewAIChat = ({
  reviewId,
  reviewTitle,
  codeContent,
  feedbacks,
}: ReviewAIChatProps) => {
  // カスタムフックによるAIチャット機能
  const chatContext: ChatContext = {
    reviewTitle,
    codeContent,
    feedbacks: feedbacks?.map((f) => ({
      problem_point: f.problem_point,
      suggestion: f.suggestion,
      priority: f.priority,
    })),
  };

  const { messages, isLoading, sendMessage, addInitialMessage, resetMessages } =
    useAIChat({
      reviewId,
      context: chatContext,
      onError: (error) => console.error("Chat error:", error),
    });

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // チャットを開いたときに初期メッセージを表示
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addInitialMessage(
        `こんにちは！レビュー「${
          reviewTitle || `#${reviewId}`
        }」についてわからないことがあればお気軽にお聞きください。`
      );
    }
  }, [isOpen, messages.length, reviewId, reviewTitle, addInitialMessage]);

  // メッセージが追加されたときに自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // チャットを開く
  const openChat = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // チャットを閉じる
  const closeChat = () => {
    setIsOpen(false);
    setIsMinimized(false);
    resetMessages(); // チャットを閉じるときメッセージをリセット
  };

  // チャットを最小化
  const minimizeChat = () => {
    setIsMinimized(!isMinimized);
  };

  // メッセージ送信処理
  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading) return;

    // メッセージを送信
    sendMessage(inputValue);
    setInputValue("");
  };

  // Enterキーでメッセージを送信
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="relative z-50">
      {/* フローティングアイコン */}
      {!isOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
          aria-label="AIチャットを開く"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* チャットモーダル */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-80 sm:w-96 bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border border-gray-200">
          {/* ヘッダー */}
          <div className="bg-blue-600 text-white p-3 flex justify-between items-center">
            <h3 className="font-medium text-sm">AIアシスタント</h3>
            <div className="flex space-x-2">
              <button
                onClick={minimizeChat}
                className="hover:text-blue-200"
                aria-label="最小化"
              >
                <MinusCircle size={18} />
              </button>
              <button
                onClick={closeChat}
                className="hover:text-blue-200"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* メッセージエリア */}
          {!isMinimized && (
            <>
              <div className="flex-1 p-3 overflow-y-auto max-h-96 bg-gray-50">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`mb-3 ${
                      message.sender === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg max-w-[85%] ${
                        message.sender === "user"
                          ? "bg-blue-600 text-white rounded-br-none"
                          : "bg-gray-200 text-gray-800 rounded-bl-none"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start mb-3">
                    <div className="p-2 rounded-lg max-w-[85%] bg-gray-200 text-gray-800 rounded-bl-none">
                      <div className="flex items-center">
                        <Loader2 size={14} className="animate-spin mr-2" />
                        <p className="text-sm">回答を生成中...</p>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 入力エリア */}
              <div className="p-3 border-t border-gray-200">
                <div className="flex items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="質問を入力..."
                    className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSendMessage}
                    className={`p-2 ml-2 rounded-r-md ${
                      isLoading || !inputValue.trim()
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                    disabled={isLoading || !inputValue.trim()}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewAIChat;
