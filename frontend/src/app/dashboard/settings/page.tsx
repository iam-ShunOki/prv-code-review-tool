// frontend/src/app/dashboard/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  User,
  Lock,
  Bell,
  Settings,
  Save,
  Check,
  AlertCircle,
} from "lucide-react";

// 通知設定の型定義
interface NotificationSettings {
  id: number;
  user_id: number;
  email_notifications: boolean;
  review_completed: boolean;
  feedback_received: boolean;
  level_changed: boolean;
  system_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  // プロフィール関連の状態
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [joinYear, setJoinYear] = useState<string>("");
  const [isProfileUpdating, setIsProfileUpdating] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  // パスワード関連の状態
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordUpdating, setIsPasswordUpdating] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // 通知設定関連の状態
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings | null>(null);
  const [isNotificationsUpdating, setIsNotificationsUpdating] = useState(false);
  const [notificationsSuccess, setNotificationsSuccess] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  // ローディング状態
  const [isLoading, setIsLoading] = useState(true);

  const { user, token, updateUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // ユーザー情報の初期化
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setDepartment(user.department || "");
      setJoinYear(user.join_year ? user.join_year.toString() : "");
    }
  }, [user]);

  // 通知設定の取得
  useEffect(() => {
    const fetchNotificationSettings = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/settings/notifications`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("通知設定の取得に失敗しました");
        }

        const data = await response.json();
        setNotificationSettings(data.data);
      } catch (error) {
        console.error("通知設定取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "通知設定の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchNotificationSettings();
    }
  }, [token, toast]);

  // プロフィール更新の処理
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(false);
    setProfileError("");
    setIsProfileUpdating(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/settings/profile`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            email,
            department: department || undefined,
            join_year: joinYear ? parseInt(joinYear) : undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "プロフィールの更新に失敗しました"
        );
      }

      const data = await response.json();

      // Authコンテキストのユーザー情報を更新
      if (updateUser && data.data) {
        updateUser(data.data);
      }

      setProfileSuccess(true);
      toast({
        title: "更新完了",
        description: "プロフィールが更新されました",
      });
    } catch (error) {
      console.error("プロフィール更新エラー:", error);
      setProfileError(
        error instanceof Error
          ? error.message
          : "プロフィールの更新に失敗しました"
      );
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error
            ? error.message
            : "プロフィールの更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsProfileUpdating(false);
    }
  };

  // パスワード変更の処理
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(false);
    setPasswordError("");

    // 新しいパスワードと確認用パスワードが一致するか確認
    if (newPassword !== confirmPassword) {
      setPasswordError("新しいパスワードと確認用パスワードが一致しません");
      return;
    }

    setIsPasswordUpdating(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/settings/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "パスワードの変更に失敗しました");
      }

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "更新完了",
        description: "パスワードが変更されました",
      });
    } catch (error) {
      console.error("パスワード変更エラー:", error);
      setPasswordError(
        error instanceof Error
          ? error.message
          : "パスワードの変更に失敗しました"
      );
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error
            ? error.message
            : "パスワードの変更に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsPasswordUpdating(false);
    }
  };

  // 通知設定更新の処理
  const handleNotificationSettingsUpdate = async () => {
    if (!notificationSettings) return;

    setNotificationsSuccess(false);
    setNotificationsError("");
    setIsNotificationsUpdating(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/settings/notifications`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email_notifications: notificationSettings.email_notifications,
            review_completed: notificationSettings.review_completed,
            feedback_received: notificationSettings.feedback_received,
            level_changed: notificationSettings.level_changed,
            system_notifications: notificationSettings.system_notifications,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "通知設定の更新に失敗しました");
      }

      setNotificationsSuccess(true);
      toast({
        title: "更新完了",
        description: "通知設定が更新されました",
      });
    } catch (error) {
      console.error("通知設定更新エラー:", error);
      setNotificationsError(
        error instanceof Error ? error.message : "通知設定の更新に失敗しました"
      );
      toast({
        title: "エラーが発生しました",
        description:
          error instanceof Error
            ? error.message
            : "通知設定の更新に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsNotificationsUpdating(false);
    }
  };

  // スイッチの切り替え処理
  const handleSwitchChange = (
    key: keyof Omit<
      NotificationSettings,
      "id" | "user_id" | "created_at" | "updated_at"
    >
  ) => {
    if (!notificationSettings) return;

    setNotificationSettings({
      ...notificationSettings,
      [key]: !notificationSettings[key],
    });
  };

  // ローディング表示
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">設定</h1>
          <p className="text-gray-500 mt-1">アカウント設定とプリファレンス</p>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/4" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/6" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="text-gray-500 mt-1">アカウント設定とプリファレンス</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-[400px]">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            プロフィール
          </TabsTrigger>
          <TabsTrigger value="password">
            <Lock className="h-4 w-4 mr-2" />
            パスワード
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            通知
          </TabsTrigger>
        </TabsList>

        {/* プロフィールタブ */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>プロフィール情報</CardTitle>
              <CardDescription>個人情報とプロフィール設定</CardDescription>
            </CardHeader>
            <form onSubmit={handleProfileUpdate}>
              <CardContent className="space-y-4">
                {profileSuccess && (
                  <Alert className="bg-green-50 border-green-200 mb-4">
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertTitle>更新完了</AlertTitle>
                    <AlertDescription>
                      プロフィール情報が更新されました
                    </AlertDescription>
                  </Alert>
                )}

                {profileError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>エラー</AlertTitle>
                    <AlertDescription>{profileError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">
                    氏名<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    メールアドレス<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">部署</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="所属部署（任意）"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="joinYear">入社年度</Label>
                  <Input
                    id="joinYear"
                    type="number"
                    value={joinYear}
                    onChange={(e) => setJoinYear(e.target.value)}
                    placeholder="入社年度（任意）"
                    min="1980"
                    max={new Date().getFullYear()}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isProfileUpdating}>
                  {isProfileUpdating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2"></div>
                      更新中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      変更を保存
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* パスワードタブ */}
        <TabsContent value="password" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>パスワード変更</CardTitle>
              <CardDescription>
                アカウントのパスワードを変更します
              </CardDescription>
            </CardHeader>
            <form onSubmit={handlePasswordChange}>
              <CardContent className="space-y-4">
                {passwordSuccess && (
                  <Alert className="bg-green-50 border-green-200 mb-4">
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertTitle>更新完了</AlertTitle>
                    <AlertDescription>
                      パスワードが変更されました
                    </AlertDescription>
                  </Alert>
                )}

                {passwordError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>エラー</AlertTitle>
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="currentPassword">
                    現在のパスワード<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">
                    新しいパスワード<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <p className="text-xs text-gray-500">
                    パスワードは6文字以上必要です
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    パスワード確認<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isPasswordUpdating}>
                  {isPasswordUpdating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2"></div>
                      更新中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      パスワードを変更
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* 通知タブ */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>通知設定</CardTitle>
              <CardDescription>通知の受取方法と種類を設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationsSuccess && (
                <Alert className="bg-green-50 border-green-200 mb-4">
                  <Check className="h-4 w-4 text-green-600" />
                  <AlertTitle>更新完了</AlertTitle>
                  <AlertDescription>通知設定が更新されました</AlertDescription>
                </Alert>
              )}

              {notificationsError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>エラー</AlertTitle>
                  <AlertDescription>{notificationsError}</AlertDescription>
                </Alert>
              )}

              {notificationSettings && (
                <>
                  <div className="border-b pb-4">
                    <h3 className="font-medium mb-4">通知方法</h3>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="emailNotifications">メール通知</Label>
                        <p className="text-sm text-gray-500">
                          重要な通知をメールで受け取る
                        </p>
                      </div>
                      <Switch
                        id="emailNotifications"
                        checked={notificationSettings.email_notifications}
                        onCheckedChange={() =>
                          handleSwitchChange("email_notifications")
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-4">通知の種類</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="reviewCompleted">レビュー完了</Label>
                          <p className="text-sm text-gray-500">
                            コードレビューが完了したときに通知
                          </p>
                        </div>
                        <Switch
                          id="reviewCompleted"
                          checked={notificationSettings.review_completed}
                          onCheckedChange={() =>
                            handleSwitchChange("review_completed")
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="feedbackReceived">
                            フィードバック受信
                          </Label>
                          <p className="text-sm text-gray-500">
                            新しいフィードバックを受け取ったときに通知
                          </p>
                        </div>
                        <Switch
                          id="feedbackReceived"
                          checked={notificationSettings.feedback_received}
                          onCheckedChange={() =>
                            handleSwitchChange("feedback_received")
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="levelChanged">レベル変更</Label>
                          <p className="text-sm text-gray-500">
                            スキルレベルが変更されたときに通知
                          </p>
                        </div>
                        <Switch
                          id="levelChanged"
                          checked={notificationSettings.level_changed}
                          onCheckedChange={() =>
                            handleSwitchChange("level_changed")
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="systemNotifications">
                            システム通知
                          </Label>
                          <p className="text-sm text-gray-500">
                            メンテナンスや新機能などのシステム通知
                          </p>
                        </div>
                        <Switch
                          id="systemNotifications"
                          checked={notificationSettings.system_notifications}
                          onCheckedChange={() =>
                            handleSwitchChange("system_notifications")
                          }
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleNotificationSettingsUpdate}
                disabled={isNotificationsUpdating || !notificationSettings}
              >
                {isNotificationsUpdating ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2"></div>
                    更新中...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    設定を保存
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
