// frontend/src/components/ai/ModernReviewAIChat.tsx
import React, { useState, useRef, useEffect, useMemo } from "react";
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
  Loader2,
} from "lucide-react";
import { useAIChat, Message, ChatContext } from "@/hooks/useAIChat";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// タイプライター機能を完全に修正（ストリーミング対応）
const useTypewriter = (text: string, speed = 25, enableAnimation = true) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [shouldSkip, setShouldSkip] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const textRef = useRef(text);
  const positionRef = useRef(0);

  // テキストが変更されたときにのみ初期化
  useEffect(() => {
    // テキストが同じか基本的に空の場合は再初期化しない
    if (textRef.current === text || (!textRef.current && !text)) {
      return;
    }

    // テキストが変わった場合、参照を更新
    textRef.current = text;

    // テキストが空の場合は何もしない
    if (!text) {
      setDisplayedText("");
      setIsComplete(true);
      return;
    }

    // アニメーションが無効の場合は即時表示
    if (!enableAnimation) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    // 新しいテキストが前のテキストを含む場合は続行
    // (これがストリーミングに対応するための重要な部分)
    if (displayedText && text.startsWith(displayedText)) {
      // 既に表示されている部分はそのままで、追加部分だけ処理
      positionRef.current = displayedText.length;
      return;
    }

    // それ以外は初期化
    clearInterval(intervalRef.current || undefined);
    setDisplayedText("");
    setIsComplete(false);
    positionRef.current = 0;
  }, [text, enableAnimation]);

  // アニメーション処理
  useEffect(() => {
    // アニメーションが無効または既に完了している場合は処理しない
    if (!enableAnimation || isComplete || !textRef.current) {
      return;
    }

    // スキップが要求された場合は全テキストを表示
    if (shouldSkip) {
      setDisplayedText(textRef.current);
      setIsComplete(true);
      positionRef.current = textRef.current.length;
      setShouldSkip(false);
      return;
    }

    // 既存のインターバルをクリア
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // テキストが変わっていないか、既に表示が完了している場合
    if (positionRef.current >= textRef.current.length) {
      setIsComplete(true);
      return;
    }

    // 文字を一つずつ表示するインターバル
    intervalRef.current = setInterval(() => {
      if (positionRef.current < textRef.current.length) {
        // 一文字追加
        positionRef.current++;
        setDisplayedText(textRef.current.substring(0, positionRef.current));
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
  }, [text, speed, shouldSkip, isComplete, enableAnimation]);

  // スキップ関数
  const skipTyping = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setShouldSkip(true);
  };

  // ディスプレイテキストをリセット
  const resetTyping = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    positionRef.current = 0;
    setDisplayedText("");
    setIsComplete(false);
  };

  return {
    displayedText,
    isComplete,
    skipTyping,
    resetTyping,
  };
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

const ModernReviewAIChat: React.FC<ModernReviewAIChatProps> = ({
  reviewId,
  reviewTitle,
  codeContent,
  feedbacks,
}) => {
  // 利用制限の取得
  const { canUseFeature, getRemainingUsage } = useUsageLimit();
  const canUseAIChat = canUseFeature("ai_chat");
  const remainingChats = getRemainingUsage("ai_chat");

  // カスタムフックによるAIチャット機能
  // ContextオブジェクトをuseMemoでメモ化
  const chatContext = useMemo<ChatContext>(
    () => ({
      reviewTitle,
      codeContent,
      feedbacks: feedbacks?.map((f) => ({
        problem_point: f.problem_point,
        suggestion: f.suggestion,
        priority: f.priority,
      })),
    }),
    [reviewTitle, codeContent, feedbacks]
  );

  // useAIChatの呼び出し
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

  // 新しい参照 - ストリーミング中のメッセージを追跡
  const streamingMessageRef = useRef<Message | null>(null);

  // タイプライターアニメーションの無効化フラグ
  const [disableTypewriterAnimation, setDisableTypewriterAnimation] =
    useState(false);

  // 最新のメッセージが更新されたら参照を更新
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage.sender === "ai" && latestMessage.isStreaming) {
        streamingMessageRef.current = latestMessage;
        // ストリーミング中はタイプライターアニメーションを無効化
        setDisableTypewriterAnimation(true);
      } else if (streamingMessageRef.current && !latestMessage.isStreaming) {
        // ストリーミングが完了したら参照をクリア
        streamingMessageRef.current = null;
        // ストリーミングが終わったらタイプライターを有効化に戻す（必要に応じて）
        setDisableTypewriterAnimation(false);
      }
    }
  }, [messages]);

  // アクティブアニメーション番号が有効かチェック
  const isActiveAnimationValid =
    activeAnimation !== null &&
    activeAnimation >= 0 &&
    activeAnimation < messages.length &&
    messages[activeAnimation]?.sender === "ai";

  // アニメーション対象のテキスト
  const animationText = isActiveAnimationValid
    ? messages[activeAnimation].content
    : "";

  // タイピングエフェクトのフック - ストリーミング中は無効化
  const { displayedText, isComplete, skipTyping } = useTypewriter(
    animationText,
    25,
    !disableTypewriterAnimation
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
      // 最新のメッセージがストリーミング中でない場合のみアニメーションを設定
      if (!messages[messages.length - 1].isStreaming) {
        setActiveAnimation(messages.length - 1);
      }
    }
  }, [messages.length]);

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

  // メッセージ表示を処理する関数
  const getDisplayText = (message: Message, index: number) => {
    // ユーザーメッセージはそのまま表示
    if (message.sender !== "ai") return message.content;

    // ストリーミング中のメッセージはそのまま表示
    if (message.isStreaming) return message.content;

    // アクティブなアニメーション対象はタイプライターエフェクトで表示
    if (index === activeAnimation && !disableTypewriterAnimation)
      return displayedText;

    // それ以外はそのまま表示
    return message.content;
  };

  // 最新メッセージが空かどうかをチェック
  const isLatestMessageEmpty =
    messages.length > 0 &&
    messages[messages.length - 1].sender === "ai" &&
    messages[messages.length - 1].content.trim() === "";

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
                  <div
                    className={cn(
                      "relative rounded-lg px-4 py-2 whitespace-pre-wrap",
                      message.sender === "user"
                        ? "bg-blue-600 text-white rounded-tr-none"
                        : "bg-gray-200 text-gray-800 rounded-tl-none",
                      message.isStreaming ? "border-l-4 border-blue-400" : ""
                    )}
                  >
                    {message.sender === "ai" && (
                      <div className="text-xs font-medium mb-1 text-blue-600/80">
                        AIアシスタント
                        {message.isStreaming && (
                          <span className="ml-2 text-blue-400">
                            ストリーミング中...
                          </span>
                        )}
                      </div>
                    )}

                    {/* <p className="text-sm">{getDisplayText(message, index)}</p> */}
                    <div className="text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {getDisplayText(message, index)}
                      </ReactMarkdown>
                    </div>
                    {message.sender === "ai" &&
                      !isComplete &&
                      index === activeAnimation &&
                      !message.isStreaming && (
                        <button
                          className="absolute -bottom-7 right-0 text-xs py-1 px-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                          onClick={skipTyping}
                        >
                          スキップ
                        </button>
                      )}

                    {message.sender === "ai" &&
                      isComplete &&
                      index === messages.length - 1 &&
                      !message.isStreaming && (
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
                </div>
              </div>
            ))}

            {/* ローディング表示 - AIの返信待ちの場合のみ表示 */}
            {isLoading && isLatestMessageEmpty && (
              <div className="flex justify-start mb-4">
                <div className="flex items-start">
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
                      <div
                        className={cn(
                          "relative rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                          message.sender === "user"
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-gray-200 text-gray-800 rounded-tl-none",
                          message.isStreaming
                            ? "border-l-2 border-blue-400"
                            : ""
                        )}
                      >
                        {message.sender === "ai" && message.isStreaming && (
                          <div className="absolute -top-4 left-0 text-[9px] bg-blue-100 text-blue-600 px-1 rounded">
                            ストリーミング中...
                          </div>
                        )}

                        {getDisplayText(message, index)}

                        {message.sender === "ai" &&
                          !isComplete &&
                          index === activeAnimation &&
                          !message.isStreaming && (
                            <button
                              className="absolute -bottom-6 right-0 text-[10px] py-0.5 px-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                              onClick={skipTyping}
                            >
                              スキップ
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* ローディング表示 - AIの返信待ちの場合のみ表示 */}
                {isLoading && isLatestMessageEmpty && (
                  <div className="flex justify-start mb-3">
                    <div className="flex items-start">
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
