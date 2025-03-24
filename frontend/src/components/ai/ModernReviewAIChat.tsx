// frontend/src/components/ai/ModernReviewAIChat.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  Send,
  X,
  Minimize2,
  Maximize2,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Loader2, // LoaderCircleからLoader2に変更
  User,
  Bot,
} from "lucide-react";
import { useAIChat, Message } from "@/hooks/useAIChat";
import { useUsageLimit } from "@/contexts/UsageLimitContext";

// タイプライター機能を単純化して改善
const useTypewriter = (text: string, speed = 25) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [shouldSkip, setShouldSkip] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // テキストが空の場合は何もしない
    if (!text) {
      setDisplayedText("");
      setIsComplete(true);
      return;
    }

    // 既存のインターバルをクリア
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // 初期状態をリセット
    setDisplayedText("");
    setIsComplete(false);

    // スキップが要求された場合は全テキストを表示
    if (shouldSkip) {
      setDisplayedText(text);
      setIsComplete(true);
      setShouldSkip(false);
      return;
    }

    let i = 0;
    // 文字を一つずつ表示するインターバル
    intervalRef.current = setInterval(() => {
      if (i < text.length) {
        // 一文字追加（単語単位ではなく）
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
      } else {
        // 全て表示したらインターバルをクリア
        setIsComplete(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, speed);

    // クリーンアップ関数
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed, shouldSkip]);

  // スキップ関数
  const skipTyping = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setShouldSkip(true);
    setDisplayedText(text);
    setIsComplete(true);
  };

  return { displayedText, isComplete, skipTyping };
};

// コンポーネントのプロップス
type ModernReviewAIChatProps = {
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

const ModernReviewAIChat = ({
  reviewId,
  reviewTitle,
  codeContent,
  feedbacks,
}: ModernReviewAIChatProps) => {
  // 利用制限の取得
  const { canUseFeature, getRemainingUsage } = useUsageLimit();
  const canUseAIChat = canUseFeature("ai_chat");
  const remainingChats = getRemainingUsage("ai_chat");

  // カスタムフックによるAIチャット機能
  const chatContext = {
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
      onError: (error) => {
        console.error("Chat error:", error);
      },
      onSuccess: () => {
        // 成功時の処理
        console.log("Message sent successfully");
      },
    });

  // ローカルステート
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [localRemainingCount, setLocalRemainingCount] =
    useState(remainingChats);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeAnimation, setActiveAnimation] = useState<number | null>(null);
  const [showFeedbackButtons, setShowFeedbackButtons] = useState<number | null>(
    null
  );

  // ドラッグ関連の状態
  const dragOffset = useRef({ x: 0, y: 0 });
  const chatRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 最新のメッセージに対してタイピングエフェクトを適用
  const lastMessage = messages[messages.length - 1];
  const lastMessageContent =
    lastMessage?.sender === "ai" ? lastMessage.content : "";
  const { displayedText, isComplete, skipTyping } = useTypewriter(
    activeAnimation === messages.length - 1 ? lastMessageContent : ""
  );

  // remainingChatsが変更されたらローカルステートを更新
  useEffect(() => {
    setLocalRemainingCount(remainingChats);
  }, [remainingChats]);

  // チャットを開いたときに初期メッセージを表示
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addInitialMessage(
        `こんにちは！レビュー「${
          reviewTitle || `#${reviewId}`
        }」についてわからないことがあればお気軽にお聞きください。`
      );
      setActiveAnimation(0);
    }
  }, [isOpen, messages.length, reviewId, reviewTitle, addInitialMessage]);

  // 新しいメッセージが追加されたときにタイピングアニメーションを開始
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].sender === "ai") {
      setActiveAnimation(messages.length - 1);
    }
  }, [messages]);

  // メッセージが追加されたときに自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedText, messages]);

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
    setIsFullscreen(false);
    resetMessages(); // チャットを閉じるときメッセージをリセット
  };

  // チャットを最小化
  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  // 全画面表示の切り替え
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setIsMinimized(false);
  };

  // メッセージ送信処理
  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading || !canUseAIChat) return;

    // メッセージを送信
    sendMessage(inputValue);
    setInputValue("");

    // 実行中のタイピングアニメーションを中断
    if (activeAnimation !== null) {
      skipTyping();
    }
  };

  // Enterキーでメッセージを送信
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ドラッグ開始処理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFullscreen) return;

    setIsDragging(true);
    const rect = chatRef.current?.getBoundingClientRect();

    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    e.preventDefault();
  };

  // マウス移動とマウスアップの処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isFullscreen && chatRef.current) {
        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;

        // 画面内に収まるように位置を制約
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const chatWidth = chatRef.current.offsetWidth;
        const chatHeight = chatRef.current.offsetHeight;

        const constrainedX = Math.max(0, Math.min(winWidth - chatWidth, x));
        const constrainedY = Math.max(0, Math.min(winHeight - 100, y));

        setPosition({ x: constrainedX, y: constrainedY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isFullscreen]);

  // フィードバックボタンの表示切り替え
  const toggleFeedbackButtons = (index: number) => {
    setShowFeedbackButtons(showFeedbackButtons === index ? null : index);
  };

  // フィードバック送信処理
  const sendFeedback = (messageId: string, isPositive: boolean) => {
    console.log(
      `Feedback for message ${messageId}: ${isPositive ? "👍" : "👎"}`
    );
    // ここにフィードバックを送信するAPI呼び出しを追加
    setShowFeedbackButtons(null);
  };

  const cn = (...classes: (string | boolean | undefined)[]) => {
    return classes.filter(Boolean).join(" ");
  };

  return (
    <div className="relative z-50">
      {/* フローティングアイコン */}
      {!isOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105"
          aria-label="AIチャットを開く"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* 全画面オーバーレイ */}
      {isOpen && isFullscreen && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* ヘッダー */}
          <header className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-white rounded-full flex items-center justify-center mr-2">
                <Bot size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">AIアシスタント</h3>
                <p className="text-xs text-white/80">
                  {reviewTitle || `レビュー #${reviewId}`}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <div className="bg-white/20 px-2 py-1 text-xs rounded-full">
                残り: {localRemainingCount}回
              </div>
              <button
                onClick={toggleFullscreen}
                className="p-1 rounded hover:bg-white/20"
              >
                <Minimize2 size={18} />
              </button>
              <button
                onClick={closeChat}
                className="p-1 rounded hover:bg-white/20"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* メッセージエリア */}
          <div className="flex-1 p-4 overflow-y-auto break-words bg-gray-50">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`mb-4 ${
                  message.sender === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }`}
              >
                <div className="flex items-start max-w-[80%]">
                  {message.sender === "ai" && (
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center mr-2 mt-1">
                      <Bot size={16} className="text-blue-600" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "relative rounded-lg px-4 py-2 whitespace-pre-wrap",
                      message.sender === "user"
                        ? "bg-blue-600 text-white rounded-tr-none"
                        : "bg-gray-200 text-gray-800 rounded-tl-none"
                    )}
                  >
                    {message.sender === "ai" && (
                      <div className="text-xs font-medium mb-1 text-blue-600/80">
                        AIアシスタント
                      </div>
                    )}

                    <p className="text-sm">
                      {index === activeAnimation && message.sender === "ai"
                        ? displayedText
                        : message.content}
                    </p>

                    {message.sender === "ai" &&
                      !isComplete &&
                      index === activeAnimation && (
                        <button
                          className="absolute -bottom-7 right-0 text-xs py-1 px-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                          onClick={skipTyping}
                        >
                          スキップ
                        </button>
                      )}

                    {message.sender === "ai" &&
                      isComplete &&
                      index === messages.length - 1 && (
                        <div className="absolute -bottom-8 right-0 flex items-center space-x-1">
                          <button
                            className="text-xs py-1 px-2 text-gray-500 hover:text-gray-700"
                            onClick={() => toggleFeedbackButtons(index)}
                          >
                            フィードバック
                          </button>

                          {showFeedbackButtons === index && (
                            <div className="flex items-center bg-white border rounded-full p-1 shadow-sm">
                              <button
                                className="h-7 w-7 rounded-full text-green-500 hover:bg-green-50"
                                onClick={() => sendFeedback(message.id, true)}
                              >
                                <ThumbsUp size={14} />
                              </button>
                              <button
                                className="h-7 w-7 rounded-full text-red-500 hover:bg-red-50"
                                onClick={() => sendFeedback(message.id, false)}
                              >
                                <ThumbsDown size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>

                  {message.sender === "user" && (
                    <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center ml-2 mt-1">
                      <User size={16} className="text-white" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="flex items-start">
                  <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center mr-2 mt-1">
                    <Bot size={16} className="text-blue-600" />
                  </div>
                  <div className="bg-gray-200 rounded-lg rounded-tl-none px-4 py-3">
                    <div className="text-xs font-medium mb-1 text-blue-600/80">
                      AIアシスタント
                    </div>
                    <div className="flex items-center">
                      <Loader2 size={16} className="animate-spin mr-2" />
                      <p className="text-sm">回答を考えています...</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 入力エリア */}
          <div className="p-4 border-t">
            <div className="flex items-center max-w-3xl mx-auto relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  canUseAIChat ? "質問を入力..." : "本日の利用制限に達しました"
                }
                className="w-full pr-12 py-2 px-4 rounded-full bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading || !canUseAIChat}
              />
              <button
                onClick={handleSendMessage}
                className={cn(
                  "absolute right-1 rounded-full w-10 h-10 flex items-center justify-center",
                  isLoading || !inputValue.trim() || !canUseAIChat
                    ? "text-gray-400 bg-gray-200 cursor-not-allowed"
                    : "text-white bg-blue-600 hover:bg-blue-700"
                )}
                disabled={isLoading || !inputValue.trim() || !canUseAIChat}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* フローティングチャットウィンドウ */}
      {isOpen && !isFullscreen && (
        <div
          ref={chatRef}
          className={cn(
            "fixed bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border z-50 transition-all duration-150 ease-in-out",
            isDragging ? "cursor-grabbing" : "cursor-auto",
            isMinimized ? "h-auto w-80" : "w-96 h-[500px]"
          )}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          {/* ヘッダー */}
          <div
            className="bg-blue-600 text-white p-3 flex justify-between items-center cursor-grab"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center">
              <div className="h-7 w-7 bg-white rounded-full flex items-center justify-center mr-2">
                <Bot size={14} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-sm">AIアシスタント</h3>
                {!isMinimized && (
                  <p className="text-[10px] text-white/70 truncate max-w-[150px]">
                    {reviewTitle || `レビュー #${reviewId}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex space-x-1">
              <button
                className="h-6 w-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded"
                onClick={toggleMinimize}
              >
                {isMinimized ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
              <button
                className="h-6 w-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded"
                onClick={toggleFullscreen}
              >
                <Maximize2 size={14} />
              </button>
              <button
                className="h-6 w-6 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded"
                onClick={closeChat}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* メッセージエリア */}
          {!isMinimized && (
            <>
              <div className="flex-1 p-3 overflow-y-auto break-words bg-gray-50">
                {messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`mb-3 ${
                      message.sender === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }`}
                  >
                    <div className="flex items-start max-w-[85%]">
                      {message.sender === "ai" && (
                        <div className="h-6 w-6 bg-blue-100 rounded-full flex items-center justify-center mr-1.5 mt-0.5">
                          <Bot size={12} className="text-blue-600" />
                        </div>
                      )}

                      <div
                        className={cn(
                          "relative rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                          message.sender === "user"
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-gray-200 text-gray-800 rounded-tl-none"
                        )}
                      >
                        {index === activeAnimation && message.sender === "ai"
                          ? displayedText
                          : message.content}

                        {message.sender === "ai" &&
                          !isComplete &&
                          index === activeAnimation && (
                            <button
                              className="absolute -bottom-6 right-0 text-[10px] py-0.5 px-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                              onClick={skipTyping}
                            >
                              スキップ
                            </button>
                          )}
                      </div>

                      {message.sender === "user" && (
                        <div className="h-6 w-6 bg-blue-600 rounded-full flex items-center justify-center ml-1.5 mt-0.5">
                          <User size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start mb-3">
                    <div className="flex items-start">
                      <div className="h-6 w-6 bg-blue-100 rounded-full flex items-center justify-center mr-1.5 mt-0.5">
                        <Bot size={12} className="text-blue-600" />
                      </div>
                      <div className="bg-gray-200 rounded-lg rounded-tl-none px-3 py-2">
                        <div className="flex items-center">
                          <Loader2 size={12} className="animate-spin mr-1" />
                          <p className="text-sm">回答を考えています...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 入力エリア */}
              <div className="p-3 border-t">
                <div className="flex items-center relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      canUseAIChat
                        ? "質問を入力..."
                        : "本日の利用制限に達しました"
                    }
                    className="w-full pr-10 py-1.5 px-3 text-sm rounded-full bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading || !canUseAIChat}
                  />
                  <button
                    onClick={handleSendMessage}
                    className={cn(
                      "absolute right-1 rounded-full w-8 h-8 flex items-center justify-center",
                      isLoading || !inputValue.trim() || !canUseAIChat
                        ? "text-gray-400 bg-gray-200 cursor-not-allowed"
                        : "text-white bg-blue-600 hover:bg-blue-700"
                    )}
                    disabled={isLoading || !inputValue.trim() || !canUseAIChat}
                  >
                    <Send size={14} />
                  </button>
                </div>
                <div className="mt-1 text-xs text-gray-500 text-right">
                  残り: {localRemainingCount}回
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ModernReviewAIChat;
