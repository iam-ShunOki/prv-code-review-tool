// frontend/src/app/dashboard/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { UsageLimitSettings } from "@/components/admin/UsageLimitSettings";
import {
  AlertCircle,
  UserCog,
  Settings as SettingsIcon,
  Shield,
  Bell,
  User,
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // 設定画面の各タブの定義
  const tabs = [
    {
      id: "profile",
      label: "プロフィール",
      icon: <User className="w-4 h-4 mr-2" />,
      adminOnly: false,
    },
    {
      id: "notifications",
      label: "通知設定",
      icon: <Bell className="w-4 h-4 mr-2" />,
      adminOnly: false,
    },
    {
      id: "security",
      label: "セキュリティ",
      icon: <Shield className="w-4 h-4 mr-2" />,
      adminOnly: false,
    },
    {
      id: "admin",
      label: "管理者設定",
      icon: <UserCog className="w-4 h-4 mr-2" />,
      adminOnly: true,
    },
  ];

  // 管理者設定の各タブの定義
  const adminTabs = [
    {
      id: "usage-limits",
      label: "利用制限",
      component: <UsageLimitSettings />,
    },
    {
      id: "system",
      label: "システム設定",
      component: (
        <div className="p-4 text-center text-gray-500">
          システム設定は開発中です
        </div>
      ),
    },
  ];

  // 選択中のタブとサブタブの状態
  const [activeTab, setActiveTab] = useState("profile");
  const [activeAdminTab, setActiveAdminTab] = useState("usage-limits");

  // 当面は未実装の設定ページがあることを示すプレースホルダーコンポーネント
  const PlaceholderSettingsContent = ({
    title,
    isAdminSection = false,
  }: {
    title: string;
    isAdminSection?: boolean;
  }) => (
    <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
      <SettingsIcon className="w-12 h-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}設定</h3>
      <p className="text-sm text-gray-500 text-center max-w-md mb-4">
        この設定画面は現在開発中です。近日中に利用可能になります。
      </p>
      {isAdminSection && !isAdmin && (
        <div className="flex items-center bg-yellow-50 text-yellow-800 p-3 rounded-md mt-4">
          <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
          <span>この設定は管理者のみアクセスできます</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">設定</h3>
        <p className="text-muted-foreground">
          アカウント設定やシステム設定の管理
        </p>
      </div>
      <Separator />

      <Tabs
        defaultValue="profile"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="mb-8">
          {tabs
            .filter((tab) => !tab.adminOnly || isAdmin)
            .map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center"
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
        </TabsList>

        <TabsContent value="profile">
          <PlaceholderSettingsContent title="プロフィール" />
        </TabsContent>

        <TabsContent value="notifications">
          <PlaceholderSettingsContent title="通知" />
        </TabsContent>

        <TabsContent value="security">
          <PlaceholderSettingsContent title="セキュリティ" />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin">
            <Tabs
              defaultValue="usage-limits"
              value={activeAdminTab}
              onValueChange={setActiveAdminTab}
            >
              <TabsList className="mb-6">
                {adminTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {adminTabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id}>
                  {tab.component}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
