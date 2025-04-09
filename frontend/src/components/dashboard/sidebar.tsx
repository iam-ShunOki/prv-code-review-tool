// frontend/src/components/dashboard/sidebar.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  Home,
  Code,
  ListChecks,
  BarChart,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  GitFork,
  FolderKanban,
  UserPlus,
  MessagesSquare,
} from "lucide-react";
import { UsageLimitBadge } from "@/components/usage/UsageLimitBadge";

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ページ遷移時にモバイルメニューを閉じる
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // 画面外クリックでモバイルメニューを閉じる
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const sidebar = document.getElementById("sidebar");
      const menuButton = document.getElementById("menu-button");

      if (
        mobileOpen &&
        sidebar &&
        menuButton &&
        !sidebar.contains(event.target as Node) &&
        !menuButton.contains(event.target as Node)
      ) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isAdmin = user?.role === "admin";

  // パス比較関数を修正（startsWith方式）
  const isPathActive = (path: string) => {
    // 完全一致の場合
    if (pathname === path) return true;

    // ルートパスの場合は完全一致のみを考慮
    if (path === "/dashboard") {
      return pathname === "/dashboard";
    }

    // その他のパスは前方一致を確認（サブパスを含む）
    if (path !== "/dashboard" && pathname?.startsWith(path + "/")) {
      return true;
    }

    return false;
  };

  const navigation = [
    { name: "ダッシュボード", href: "/dashboard", icon: Home },
    {
      name: "コードレビュー",
      href: "/dashboard/reviews",
      icon: Code,
      badge: !isAdmin ? <UsageLimitBadge featureKey="code_review" /> : null,
    },
    {
      name: "AIチャット",
      href: "/dashboard/chat",
      icon: MessagesSquare,
    },
    { name: "プロジェクト", href: "/dashboard/projects", icon: FolderKanban },
    { name: "グループ", href: "/dashboard/groups", icon: UserPlus },
    ...(isAdmin
      ? [
          { name: "分析", href: "/dashboard/analytics", icon: BarChart },
          { name: "社員管理", href: "/dashboard/employees", icon: Users },
          {
            name: "リポジトリ管理",
            href: "/dashboard/admin/repositories",
            icon: GitFork,
          },
        ]
      : [{ name: "進捗状況", href: "/dashboard/progress", icon: ListChecks }]),
    { name: "設定", href: "/dashboard/settings", icon: Settings },
  ];

  const toggleMobileMenu = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <>
      {/* モバイルトグルボタン */}
      <div className="md:hidden fixed top-0 left-0 p-4 z-20">
        <button
          id="menu-button"
          onClick={toggleMobileMenu}
          className="p-2 rounded-md text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          aria-expanded={mobileOpen}
          aria-controls="sidebar"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          <span className="sr-only">
            {mobileOpen ? "メニューを閉じる" : "メニューを開く"}
          </span>
        </button>
      </div>

      {/* サイドバーオーバーレイ - モバイル表示時のみ */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-gray-600 bg-opacity-50 z-10"
          aria-hidden="true"
        />
      )}

      {/* サイドバー */}
      <div
        id="sidebar"
        className={`
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} 
          md:translate-x-0
          transition-transform duration-200 ease-in-out
          fixed md:static z-10
          w-64 h-screen bg-white shadow-lg
        `}
        aria-label="サイドバーナビゲーション"
      >
        <div className="flex flex-col h-full">
          {/* ヘッダー */}
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold">コードレビューツール</h2>
            <div className="mt-2 text-sm text-gray-600">
              <p>{user?.name}</p>
              <p>{user?.role === "admin" ? "管理者" : "新入社員"}</p>
            </div>
            {/* 管理者以外の場合は利用制限バッジを表示 */}
            {!isAdmin && (
              <div className="mt-2 flex space-x-3">
                <div className="flex items-center text-xs text-gray-500">
                  <UsageLimitBadge featureKey="code_review" showLabel />
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <UsageLimitBadge featureKey="ai_chat" showLabel />
                </div>
              </div>
            )}
          </div>

          {/* ナビゲーション */}
          <nav className="flex-1 p-4 space-y-1" aria-label="サイドバーメニュー">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center px-4 py-2 rounded-md text-sm font-medium
                  ${
                    isPathActive(item.href)
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }
                `}
                aria-current={isPathActive(item.href) ? "page" : undefined}
              >
                <item.icon className="mr-3 h-5 w-5" aria-hidden="true" />
                <span className="flex-1">{item.name}</span>
                {item.badge && <span>{item.badge}</span>}
              </Link>
            ))}
          </nav>

          {/* フッター */}
          <div className="p-4 border-t">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-700 rounded-md hover:bg-red-50"
            >
              <LogOut className="mr-3 h-5 w-5" aria-hidden="true" />
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
