// frontend/src/components/ai/ReviewAIChat.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  Send,
  X,
  MinusCircle,
  Loader2,
  AlertCircle,
  Maximize2,
  Minimize2,
  ChevronsDown,
  ChevronsUp,
} from "lucide-react";
import { useAIChat, Message, ChatContext } from "@/hooks/useAIChat";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UsageLimitBadge } from "@/components/usage/UsageLimitBadge";

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

// チャットサイズの型定義
interface ChatSize {
  width: number;
  height: number;
}

// ローカルストレージキー
const CHAT_SIZE_KEY = "ai_chat_size";
const CHAT_POSITION_KEY = "ai_chat_position";

const ReviewAIChat = ({
  reviewId,
  reviewTitle,
  codeContent,
  feedbacks,
}: ReviewAIChatProps) => {
  // 利用制限の取得
  const { canUseFeature, getRemainingUsage, updateLocalUsageCount } =
    useUsageLimit();
  const canUseAIChat = canUseFeature("ai_chat");
  const remainingChats = getRemainingUsage("ai_chat");

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
      onError: (error) => {
        console.error("Chat error:", error);
        // エラー時には残りカウントを復元（エラーでカウントしない場合）
        if (remainingChats > 0) {
          updateLocalUsageCount("ai_chat", {
            remaining: remainingChats,
            used: usageInfo?.used || 0,
          });
        }
      },
      onSuccess: () => {
        // 成功時の処理はuseAIChat内で行う
      },
    });

  // 現在の利用状況
  const usageInfo = useUsageLimit().getUsageInfo("ai_chat");

  // ローカルステート
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [localRemainingCount, setLocalRemainingCount] =
    useState(remainingChats);

  // サイズと位置の状態
  const [chatSize, setChatSize] = useState<ChatSize>({
    width: 400,
    height: 500,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // 左上からの配置に変更
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const chatRef = useRef<HTMLDivElement>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // remainingChatsが変更されたらローカルステートを更新
  useEffect(() => {
    setLocalRemainingCount(remainingChats);
  }, [remainingChats]);

  // 保存されたサイズと位置を復元
  useEffect(() => {
    try {
      const savedSize = localStorage.getItem(CHAT_SIZE_KEY);
      if (savedSize) {
        setChatSize(JSON.parse(savedSize));
      }

      const savedPosition = localStorage.getItem(CHAT_POSITION_KEY);
      if (savedPosition) {
        setPosition(JSON.parse(savedPosition));
      }
    } catch (error) {
      console.error("Error loading saved chat configuration:", error);
    }
  }, []);

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
    setIsFullscreen(false);
    resetMessages(); // チャットを閉じるときメッセージをリセット
  };

  // チャットを最小化
  const minimizeChat = () => {
    setIsMinimized(!isMinimized);
  };

  // 全画面表示の切り替え
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setIsMinimized(false);
  };

  // メッセージ送信処理 (即時カウント更新機能付き)
  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading || !canUseAIChat) return;

    // 送信前にローカルでカウントを減らす
    if (localRemainingCount > 0) {
      // UIをすぐに更新
      setLocalRemainingCount((prev) => Math.max(0, prev - 1));

      // コンテキストも更新
      if (usageInfo) {
        updateLocalUsageCount("ai_chat", {
          used: usageInfo.used + 1,
          remaining: Math.max(0, usageInfo.remaining - 1),
          canUse: usageInfo.remaining > 1, // 残り1回なら送信後は0になるので
        });
      }
    }

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

  // ドラッグ開始処理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFullscreen) return;

    setIsDragging(true);
    const rect = chatRef.current?.getBoundingClientRect();

    if (rect) {
      // クリック位置とウィンドウ左上の差分を記録
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    e.preventDefault();
  };

  // リサイズ開始処理
  const handleResizeStart = (e: React.MouseEvent) => {
    if (isFullscreen) return;

    setIsResizing(true);
    e.stopPropagation();
    e.preventDefault();
  };

  // マウス移動とマウスアップの処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // ドラッグ処理
      if (isDragging && !isFullscreen) {
        // マウス位置からウィンドウの左上位置を計算
        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;

        // 画面内に収まるように位置を制約
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        const constrainedX = Math.max(
          0,
          Math.min(winWidth - chatSize.width, x)
        );
        const constrainedY = Math.max(0, Math.min(winHeight - 100, y));

        setPosition({ x: constrainedX, y: constrainedY });
      }

      // リサイズ処理
      if (isResizing && !isFullscreen && chatRef.current) {
        const rect = chatRef.current.getBoundingClientRect();
        const width = e.clientX - rect.left;
        const height = e.clientY - rect.top;

        setChatSize({
          width: Math.max(300, width),
          height: Math.max(400, height),
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // 位置を保存
        localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(position));
      }

      if (isResizing) {
        setIsResizing(false);
        // サイズを保存
        localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(chatSize));
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, chatSize, isFullscreen, position]);

  // チャットのサイズを大きく/小さくするボタン処理
  const enlargeChat = () => {
    const newSize = {
      width: chatSize.width + 100,
      height: chatSize.height + 100,
    };
    setChatSize(newSize);
    localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(newSize));
  };

  const shrinkChat = () => {
    const newSize = {
      width: Math.max(300, chatSize.width - 100),
      height: Math.max(400, chatSize.height - 100),
    };
    setChatSize(newSize);
    localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(newSize));
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

      {/* 全画面オーバーレイ */}
      {isOpen && isFullscreen && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* 全画面ヘッダー */}
          <div className="bg-blue-600 text-white p-3 flex justify-between items-center shadow-md">
            <h3 className="font-medium flex items-center">
              AIアシスタント - {reviewTitle || `レビュー #${reviewId}`}
              <span className="ml-2">
                <UsageLimitBadge featureKey="ai_chat" />
              </span>
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={toggleFullscreen}
                className="hover:text-blue-200"
                aria-label="ウィンドウ表示に戻る"
              >
                <Minimize2 size={18} />
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

          {/* 全画面メッセージエリア */}
          <div className="flex-1 p-4 overflow-y-auto break-words bg-gray-50">
            {!canUseAIChat && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>利用制限に達しました</AlertTitle>
                <AlertDescription>
                  本日のAIチャットの利用回数制限に達しました。明日以降に再度お試しください。
                </AlertDescription>
              </Alert>
            )}

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
                  className={`p-3 rounded-lg max-w-[70%] ${
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
                <div className="p-3 rounded-lg max-w-[70%] bg-gray-200 text-gray-800 rounded-bl-none">
                  <div className="flex items-center">
                    <Loader2 size={14} className="animate-spin mr-2" />
                    <p className="text-sm">回答を生成中...</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 全画面入力エリア */}
          <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex items-center max-w-4xl mx-auto">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  canUseAIChat ? "質問を入力..." : "本日の利用制限に達しました"
                }
                className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading || !canUseAIChat}
              />
              <button
                onClick={handleSendMessage}
                className={`ml-4 p-3 rounded-r-md ${
                  isLoading || !inputValue.trim() || !canUseAIChat
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                disabled={isLoading || !inputValue.trim() || !canUseAIChat}
              >
                <Send size={18} />
              </button>
            </div>
            {/* 残りチャット回数表示 */}
            <div className="mt-2 text-xs text-gray-500 text-right max-w-4xl mx-auto">
              残り: {localRemainingCount}回
            </div>
          </div>
        </div>
      )}

      {/* ウィンドウモードのチャットモーダル */}
      {isOpen && !isFullscreen && (
        <div
          ref={chatRef}
          className={`fixed ${
            isDragging || isResizing ? "transition-none" : "transition-all"
          } bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border border-gray-200 z-50`}
          style={{
            width: `${chatSize.width}px`,
            height: isMinimized ? "auto" : `${chatSize.height}px`,
            left: `${position.x}px`,
            top: `${position.y}px`,
            cursor: isDragging ? "grabbing" : "auto",
          }}
        >
          {/* ヘッダー (ドラッグハンドル付き) */}
          <div
            className="bg-blue-600 text-white p-3 flex justify-between items-center cursor-grab"
            onMouseDown={handleMouseDown}
          >
            <h3 className="font-medium text-sm flex items-center">
              AIアシスタント
              <span className="ml-2">
                <UsageLimitBadge featureKey="ai_chat" />
              </span>
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={shrinkChat}
                className="hover:text-blue-200"
                aria-label="縮小"
              >
                <ChevronsDown size={16} />
              </button>
              <button
                onClick={enlargeChat}
                className="hover:text-blue-200"
                aria-label="拡大"
              >
                <ChevronsUp size={16} />
              </button>
              <button
                onClick={toggleFullscreen}
                className="hover:text-blue-200"
                aria-label="全画面表示"
              >
                <Maximize2 size={18} />
              </button>
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
              <div className="flex-1 p-3 overflow-y-auto break-words bg-gray-50">
                {/* 利用制限警告 */}
                {!canUseAIChat && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>利用制限に達しました</AlertTitle>
                    <AlertDescription>
                      本日のAIチャットの利用回数制限に達しました。明日以降に再度お試しください。
                    </AlertDescription>
                  </Alert>
                )}

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
                    placeholder={
                      canUseAIChat
                        ? "質問を入力..."
                        : "本日の利用制限に達しました"
                    }
                    className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading || !canUseAIChat}
                  />
                  <button
                    onClick={handleSendMessage}
                    className={`ml-4 p-2 rounded-r-md ${
                      isLoading || !inputValue.trim() || !canUseAIChat
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                    disabled={isLoading || !inputValue.trim() || !canUseAIChat}
                  >
                    <Send size={18} />
                  </button>
                </div>
                {/* 残りチャット回数表示 - リアルタイム更新 */}
                <div className="mt-2 text-xs text-gray-500 text-right">
                  残り: {localRemainingCount}回
                </div>
              </div>
            </>
          )}

          {/* リサイズハンドル */}
          {!isMinimized && (
            <div
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize bg-gray-200 opacity-70 hover:opacity-100 rounded-tl-md flex items-center justify-center"
              onMouseDown={handleResizeStart}
            >
              <div className="w-3 h-3 border-b-2 border-r-2 border-gray-600"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewAIChat;
