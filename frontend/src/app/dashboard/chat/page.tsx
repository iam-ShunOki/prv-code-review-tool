// frontend/src/app/dashboard/chat/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUsageLimit } from "@/contexts/UsageLimitContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  User,
  Send,
  Sparkles,
  Code,
  BookOpen,
  Lightbulb,
  AlertCircle,
  CornerDownRight,
  RefreshCw,
  PlusCircle,
  ExternalLink,
  History,
  ChevronRight,
  Archive,
  Clock,
  Calendar,
  MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useLearningChat, ChatMode } from "@/hooks/useLearningChat";

// テキストエリアの高さを自動調整するカスタムフック
const useAutoResizeTextarea = (
  minHeight: number = 100,
  maxHeight: number = 300
) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // テキストエリアの高さを調整する関数
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 一旦高さをリセット
    textarea.style.height = "auto";

    // スクロールの高さに基づいて高さを設定（最小・最大値を考慮）
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight
    );
    textarea.style.height = `${newHeight}px`;
  };

  return { textareaRef, adjustHeight };
};

// チャット履歴アイテムの型定義
interface ChatHistoryItem {
  id: string;
  sessionId: string;
  title: string;
  timestamp: string;
  preview: string;
}

const ChatPage = () => {
  const { user, token } = useAuth();
  const { canUseFeature, getRemainingUsage } = useUsageLimit();
  const canUseAIChat = canUseFeature("ai_chat");
  const remainingChats = getRemainingUsage("ai_chat");
  const { toast } = useToast();

  // チャットセッションIDを生成（ページロード時に一度のみ実行）
  const [chatSessionId] = useState(
    () => `chat-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  );

  // 学習チャットフックを使用（セッションIDを渡す）
  const {
    messages,
    setMessages,
    sendMessage,
    isLoading,
    setIsLoading,
    error,
    resetChat,
    fetchChatHistory,
    loadChatSession,
  } = useLearningChat(chatSessionId);

  // ローカルの状態管理
  const [inputValue, setInputValue] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("general");
  const [showHistory, setShowHistory] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(chatSessionId);

  // テキストエリアの自動リサイズ機能
  const { textareaRef, adjustHeight } = useAutoResizeTextarea();

  // UIの参照
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが追加されたら自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // テキストエリアの値が変わったら高さを調整
  useEffect(() => {
    adjustHeight();
  }, [inputValue]);

  // チャット情報が更新されるたびに履歴を取得
  useEffect(() => {
    loadChatHistory();
  }, [messages]);

  // チャット履歴を取得する関数
  const loadChatHistory = async () => {
    setIsHistoryLoading(true);
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

      // APIからのレスポンスを整形
      if (data.success && Array.isArray(data.data)) {
        const formattedHistory: ChatHistoryItem[] = data.data.map(
          (session: any) => ({
            id:
              session.id ||
              `session-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 5)}`,
            sessionId: session.session_id,
            title: session.title || "無題の会話",
            timestamp: new Date(
              session.created_at || Date.now()
            ).toLocaleString(),
            preview: session.preview || "内容なし",
          })
        );
        setChatHistory(formattedHistory);
      } else {
        setChatHistory([]);
      }
    } catch (err) {
      console.error("チャット履歴の取得に失敗しました", err);
      // エラー時は空の配列をセット
      setChatHistory([]);
      toast({
        title: "エラー",
        description: "チャット履歴の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // 履歴からチャットを読み込む関数
  const loadChatFromHistory = async (sessionId: string) => {
    try {
      // スピナーを表示
      setIsLoading(true);

      // 選択されたセッションIDを設定
      setActiveSessionId(sessionId);

      try {
        // セッションの読み込み（APIを呼び出し）
        await loadChatSession(sessionId);

        // 成功メッセージを表示
        toast({
          title: "チャット履歴を読み込みました",
          description: `セッションID: ${sessionId.substring(0, 8)}...`,
          duration: 2000,
        });

        // 履歴表示は閉じない
        // setShowHistory(false);
      } catch (loadError) {
        console.error("セッション読み込みエラー:", loadError);

        // APIエラーの場合、フォールバックで直接メッセージを取得
        const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/learning-chat/messages`;
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("メッセージの取得に失敗しました");
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.data)) {
          const sortedMessages = [...data.data].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );

          setMessages(
            sortedMessages.map((msg) => ({
              id: msg.id.toString(),
              content: msg.content,
              sender: msg.sender,
              created_at: msg.created_at,
              sessionId: msg.session_id,
            }))
          );

          toast({
            title: "チャット履歴を読み込みました",
            description: `セッションID: ${sessionId.substring(0, 8)}...`,
            duration: 2000,
          });

          // 履歴表示は閉じない
          // setShowHistory(false);
        } else {
          throw new Error("メッセージの取得に失敗しました");
        }
      }
    } catch (err) {
      console.error("チャットセッションの読み込みに失敗しました:", err);
      toast({
        title: "エラー",
        description: "チャット履歴の読み込みに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // メッセージ送信処理
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !canUseAIChat) return;

    try {
      // セッションIDを含めてメッセージを送信
      await sendMessage(inputValue, chatMode, activeSessionId);
      setInputValue("");

      // 入力フィールドにフォーカスを戻す
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // 高さをリセット
          textareaRef.current.style.height = `${100}px`;
        }
      }, 100);
    } catch (err) {
      toast({
        title: "エラー",
        description: "メッセージの送信中にエラーが発生しました",
        variant: "destructive",
      });
    }
  };

  // Enterキーでメッセージを送信（Shift+Enterは改行）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 新しい会話を開始
  const startNewConversation = async () => {
    try {
      // 新しいセッションIDを生成
      const newSessionId = `chat-${Date.now()}-${Math.floor(
        Math.random() * 1000
      )}`;
      setActiveSessionId(newSessionId);

      // チャットをリセット
      await resetChat(newSessionId);
      setShowHistory(false);
    } catch (err) {
      toast({
        title: "エラー",
        description: "新しい会話の開始に失敗しました",
        variant: "destructive",
      });
    }
  };

  // コードブロックのレンダリングカスタマイズ
  const renderCodeBlock = ({
    language,
    value,
  }: {
    language: string;
    value: string;
  }) => {
    return (
      <div className="my-4 rounded-md overflow-hidden">
        <div className="bg-zinc-800 text-zinc-200 text-xs py-1 px-4 flex justify-between items-center">
          <span>{language || "code"}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-zinc-300 hover:text-white"
            onClick={() => {
              navigator.clipboard.writeText(value);
              toast({
                title: "コピーしました",
                description: "コードをクリップボードにコピーしました",
                duration: 2000,
              });
            }}
          >
            <CopyIcon className="h-3.5 w-3.5 mr-1" />
            コピー
          </Button>
        </div>
        <SyntaxHighlighter
          language={language || "javascript"}
          style={vscDarkPlus}
          customStyle={{ margin: 0 }}
          showLineNumbers
        >
          {value}
        </SyntaxHighlighter>
      </div>
    );
  };

  // エラー表示があればトースト通知
  useEffect(() => {
    if (error) {
      toast({
        title: "エラー",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* コンパクトなサイドバー */}
        <div className="w-full lg:w-1/6">
          <Card className="h-full">
            <CardHeader className="p-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                学習アシスタント
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="space-y-3">
                {/* メインアクション */}
                <div className="flex flex-col space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startNewConversation}
                    className="w-full justify-start"
                    disabled={isLoading}
                  >
                    <PlusCircle className="h-3.5 w-3.5 mr-2" />
                    新しい会話
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full justify-start"
                  >
                    <History className="h-3.5 w-3.5 mr-2" />
                    {showHistory ? "履歴を閉じる" : "チャット履歴"}
                  </Button>
                </div>

                {/* チャット履歴表示エリア */}
                {showHistory && (
                  <div className="mt-3 border-t pt-3">
                    <h3 className="text-sm font-medium mb-2 flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      過去の会話
                    </h3>

                    {isHistoryLoading ? (
                      <div className="flex justify-center py-3">
                        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : chatHistory.length > 0 ? (
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {chatHistory.map((chat) => (
                            <Card
                              key={chat.id}
                              className={`p-2 text-xs cursor-pointer hover:bg-muted ${
                                chat.sessionId === activeSessionId
                                  ? "border-primary"
                                  : ""
                              }`}
                              onClick={() =>
                                loadChatFromHistory(chat.sessionId)
                              }
                            >
                              <div className="font-medium line-clamp-1">
                                {chat.title}
                              </div>
                              <div className="text-muted-foreground text-[10px] mt-0.5 flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {chat.timestamp}
                              </div>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-xs text-center text-muted-foreground py-3">
                        履歴はありません
                      </div>
                    )}
                  </div>
                )}

                {/* モード選択 */}
                <div className="mt-2">
                  <div className="text-xs font-medium mb-1.5">モード</div>
                  <Tabs
                    value={chatMode}
                    onValueChange={(value) => setChatMode(value as ChatMode)}
                    className="w-full"
                  >
                    <TabsList className="grid grid-cols-2 h-8">
                      <TabsTrigger value="general" className="text-xs">
                        一般
                      </TabsTrigger>
                      <TabsTrigger value="debugging" className="text-xs">
                        デバッグ
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* 使用状況 */}
                <div className="text-xs flex items-center justify-between pt-2 border-t">
                  <span className="text-muted-foreground">残り回数:</span>
                  <Badge
                    variant={remainingChats > 5 ? "default" : "destructive"}
                    className="text-[10px] h-5"
                  >
                    {remainingChats} 回
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* メインチャットエリア - 幅を拡大 */}
        <div className="w-full lg:w-5/6">
          <Card className="h-[calc(100vh-8rem)] flex flex-col">
            <CardHeader className="border-b py-3 px-6">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  プログラミング学習チャット
                  <Badge variant="outline" className="ml-2 text-xs">
                    {chatMode === "general" ? "一般" : "デバッグ"}
                  </Badge>
                  <div className="flex text-xs text-muted-foreground">
                    セッションID: {activeSessionId}
                  </div>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-xs"
                  >
                    <History className="h-3.5 w-3.5 mr-1.5" />
                    履歴
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startNewConversation}
                    disabled={isLoading}
                    className="text-xs"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1.5 ${
                        isLoading ? "animate-spin" : ""
                      }`}
                    />
                    新規会話
                  </Button>
                </div>
              </div>
            </CardHeader>

            <ScrollArea className="flex-1 p-4 overflow-auto">
              <div className="space-y-4 pb-4">
                {messages.length === 0 && !isLoading && (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    <MessageSquare className="h-5 w-5 mr-2 opacity-70" />
                    メッセージを入力して会話を開始してください
                  </div>
                )}

                {messages.map((message, index) => (
                  <div
                    key={message.id || index}
                    className={`flex ${
                      message.sender === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-3 max-w-[85%] ${
                        message.sender === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`
                          rounded-lg p-4 
                          ${
                            message.sender === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent hover:bg-muted text-foreground"
                          }
                        `}
                      >
                        {message.sender === "user" ? (
                          <div className="whitespace-pre-wrap">
                            {message.content}
                          </div>
                        ) : (
                          <div className="prose dark:prose-invert max-w-none break-words">
                            <ReactMarkdown
                              components={{
                                code(
                                  props: React.ComponentPropsWithoutRef<"code"> & {
                                    inline?: boolean;
                                    node?: any;
                                  }
                                ) {
                                  const {
                                    inline,
                                    className,
                                    children,
                                    ...rest
                                  } = props;
                                  const match = /language-(\w+)/.exec(
                                    className || ""
                                  );
                                  return !inline && match ? (
                                    renderCodeBlock({
                                      language: match[1],
                                      value: String(children).replace(
                                        /\n$/,
                                        ""
                                      ),
                                    })
                                  ) : (
                                    <code
                                      className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded text-sm"
                                      {...rest}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                                a({ node, children, href, ...props }) {
                                  return (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:text-blue-700 inline-flex items-center"
                                      {...props}
                                    >
                                      {children}
                                      <ExternalLink className="h-3 w-3 ml-1" />
                                    </a>
                                  );
                                },
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        <div
                          className={`
                            text-xs mt-2 flex justify-between items-center
                            ${
                              message.sender === "user"
                                ? "text-primary-foreground/70"
                                : "text-foreground/50"
                            }
                          `}
                        >
                          {/* <span className="opacity-70">
                            ID:{" "}
                            {message.id?.toString().substring(0, 8) ||
                              `msg-${index}`}
                          </span> */}
                          <span className="opacity-70">
                            {new Date(message.created_at).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="rounded-lg p-4 bg-muted">
                        <div className="flex items-center space-x-2">
                          <div className="h-2 w-2 bg-primary rounded-full animate-bounce"></div>
                          <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-75"></div>
                          <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-150"></div>
                          <span className="text-sm ml-2">
                            返答を考えています...
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <CardFooter className="border-t p-4">
              {!canUseAIChat ? (
                <div className="w-full bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-900 rounded-lg p-3 text-sm">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 mr-2" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-400">
                        本日の利用可能回数を使い切りました
                      </p>
                      <p className="text-yellow-700 dark:text-yellow-500 mt-1">
                        明日またご利用いただけます。より多くの利用回数が必要な場合は、管理者にお問い合わせください。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col space-y-3">
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      chatMode === "general"
                        ? "プログラミングに関する質問を入力..."
                        : "デバッグしたいコードとエラーメッセージを入力..."
                    }
                    className="flex-1 min-h-[100px] max-h-[300px] resize-y overflow-y-auto"
                    disabled={isLoading || !canUseAIChat}
                  />

                  <div className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground flex items-center">
                      <CornerDownRight className="h-3 w-3 mr-1" />
                      <span>Shift + Enter で改行</span>
                    </div>

                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || isLoading}
                    >
                      {isLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      送信
                    </Button>
                  </div>
                </div>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};

// コピーボタンのアイコン
const CopyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

export default ChatPage;
