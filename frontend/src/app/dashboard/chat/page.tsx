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
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useLearningChat, ChatMode } from "@/hooks/useLearningChat";

const ChatPage = () => {
  const { user } = useAuth();
  const { canUseFeature, getRemainingUsage } = useUsageLimit();
  const canUseAIChat = canUseFeature("ai_chat");
  const remainingChats = getRemainingUsage("ai_chat");
  const { toast } = useToast();

  // 学習チャットフックを使用
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    resetChat,
    fetchChatHistory,
  } = useLearningChat();

  // ローカルの状態管理
  const [inputValue, setInputValue] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("general");

  // UIの参照
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 新しいメッセージが追加されたら自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // メッセージ送信処理
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !canUseAIChat) return;

    try {
      await sendMessage(inputValue, chatMode);
      setInputValue("");

      // 入力フィールドにフォーカスを戻す
      setTimeout(() => {
        inputRef.current?.focus();
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
      await resetChat();
    } catch (err) {
      toast({
        title: "エラー",
        description: "会話のリセット中にエラーが発生しました",
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
        {/* サイドバー */}
        <div className="w-full lg:w-1/4">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                学習アシスタント
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  variant="outline"
                  onClick={startNewConversation}
                  className="w-full justify-start"
                  disabled={isLoading}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  新しい会話を開始
                </Button>

                <div className="flex flex-col gap-2 mt-4">
                  <div className="text-sm font-medium">モード選択</div>
                  <Tabs
                    value={chatMode}
                    onValueChange={(value) => setChatMode(value as ChatMode)}
                    className="w-full"
                  >
                    <TabsList className="grid grid-cols-3 mb-2">
                      <TabsTrigger value="general">一般</TabsTrigger>
                      <TabsTrigger value="code-review">
                        コードレビュー
                      </TabsTrigger>
                      <TabsTrigger value="debugging">デバッグ</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" className="mt-0">
                      <Card className="border-none shadow-none">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            プログラミングの概念や技術についての質問ができます。
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="code-review" className="mt-0">
                      <Card className="border-none shadow-none">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            コードの改善点やベストプラクティスについてアドバイスを得られます。
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="debugging" className="mt-0">
                      <Card className="border-none shadow-none">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            コードのバグやエラーの解決方法についてヒントを得られます。
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="pt-4 border-t">
                  <div className="text-sm font-medium mb-2">使用状況</div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      残り回数:
                    </span>
                    <Badge
                      variant={remainingChats > 5 ? "default" : "destructive"}
                    >
                      {remainingChats} 回
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="text-sm font-medium mb-2">ヒント</div>
                  <ul className="text-xs text-muted-foreground space-y-2">
                    <li className="flex gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                      <span>
                        具体的な質問をすると、より適切な回答が得られます
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Code className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span>コードブロックを使って、コードを共有できます</span>
                    </li>
                    <li className="flex gap-2">
                      <BookOpen className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>
                        提供されるリソースから自分で学ぶことを心がけましょう
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* メインチャットエリア */}
        <div className="w-full lg:w-3/4">
          <Card className="h-[calc(100vh-8rem)] flex flex-col">
            <CardHeader className="border-b py-4 px-6">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  プログラミング学習チャット
                  <Badge variant="outline" className="ml-2 text-xs">
                    {chatMode === "general"
                      ? "一般"
                      : chatMode === "code-review"
                      ? "コードレビュー"
                      : "デバッグ"}
                  </Badge>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startNewConversation}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${
                      isLoading ? "animate-spin" : ""
                    }`}
                  />
                  新しい会話
                </Button>
              </div>
            </CardHeader>

            <ScrollArea className="flex-1 p-4 overflow-auto">
              <div className="space-y-4 pb-4">
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
                      className={`flex gap-3 max-w-[80%] ${
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
                            text-xs mt-2 flex justify-end
                            ${
                              message.sender === "user"
                                ? "text-primary-foreground/70"
                                : "text-foreground/50"
                            }
                          `}
                        >
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[80%]">
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
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      chatMode === "general"
                        ? "プログラミングに関する質問を入力..."
                        : chatMode === "code-review"
                        ? "レビューしてほしいコードを入力..."
                        : "デバッグしたいコードとエラーメッセージを入力..."
                    }
                    className="flex-1 resize-none min-h-[100px]"
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
