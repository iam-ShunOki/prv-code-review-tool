// frontend/src/app/dashboard/page.tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Code, ListChecks, BarChart, Clock, TrendingUp } from "lucide-react";
import { UsageLimitDisplay } from "@/components/usage/UsageLimitDisplay";

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="text-gray-500 mt-2">
          ようこそ、{user?.name}さん。コードレビューツールへ。
        </p>
      </header>
      {/* ステータスカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-gray-500">
                {isAdmin ? "未レビュー件数" : "レビュー待ち"}
              </h3>
              <p className="text-2xl font-bold mt-2">0 件</p>
            </div>
            <div className="bg-blue-100 p-2.5 rounded-full">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-gray-500">
                {isAdmin ? "累計レビュー数" : "フィードバック件数"}
              </h3>
              <p className="text-2xl font-bold mt-2">0 件</p>
            </div>
            <div className="bg-green-100 p-2.5 rounded-full">
              <ListChecks className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-gray-500">
                {isAdmin ? "登録社員数" : "現在のレベル"}
              </h3>
              <p className="text-2xl font-bold mt-2">
                {isAdmin ? "0 名" : "C"}
              </p>
            </div>
            <div className="bg-purple-100 p-2.5 rounded-full">
              <BarChart className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>
      {isAdmin ? (
        <div className="grid grid-cols-1 md:grid-cols-3C gap-6">
          {/* クイックアクセス */}
          <div className="col-span-1 md:col-span-2">
            <h2 className="text-xl font-bold mb-4">クイックアクセス</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* 各カードの高さを揃え、ボタンを下部に配置するためのレイアウト修正 */}
              <Card className="p-6 flex flex-col h-full">
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center">
                    <Code className="h-5 w-5 mr-2" />
                    コードレビュー
                  </h3>
                  <p className="my-4 text-gray-500 text-sm">
                    コードをアップロードして、AIによる詳細なレビューを受けられます。
                  </p>
                </div>
                <div className="mt-auto pt-4">
                  <Button asChild className="w-full">
                    <Link href="/dashboard/reviews">レビュー一覧</Link>
                  </Button>
                </div>
              </Card>
              <Card className="p-6 flex flex-col h-full">
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    進捗状況の確認
                  </h3>
                  <p className="my-4 text-gray-500 text-sm">
                    これまでのレビュー履歴や成長推移を確認できます。スキルレベルと改善ポイントも確認できます。
                  </p>
                </div>
                <div className="mt-auto pt-4">
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/progress">確認する</Link>
                  </Button>
                </div>
              </Card>
              <Card className="p-6 flex flex-col h-full">
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center">
                    <BarChart className="h-5 w-5 mr-2" />
                    分析レポート
                  </h3>
                  <p className="my-4 text-gray-500 text-sm">
                    新入社員のスキル分布や成長推移を確認できます。
                  </p>
                </div>
                <div className="mt-auto pt-4">
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/analytics">分析する</Link>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 利用状況表示 */}
          <div className="col-span-1">
            <UsageLimitDisplay />
          </div>

          {/* クイックアクセス */}
          <div className="col-span-1 md:col-span-2">
            <h2 className="text-xl font-bold mb-4">クイックアクセス</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 各カードの高さを揃え、ボタンを下部に配置するためのレイアウト修正 */}
              <Card className="p-6 flex flex-col h-full">
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center">
                    <Code className="h-5 w-5 mr-2" />
                    コードレビュー
                  </h3>
                  <p className="my-4 text-gray-500 text-sm">
                    コードをアップロードして、AIによる詳細なレビューを受けられます。
                  </p>
                </div>
                <div className="mt-auto pt-4">
                  <Button asChild className="w-full">
                    <Link href="/dashboard/reviews">レビュー一覧</Link>
                  </Button>
                </div>
              </Card>

              <Card className="p-6 flex flex-col h-full">
                <div className="flex-1">
                  <h3 className="font-semibold flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    進捗状況の確認
                  </h3>
                  <p className="my-4 text-gray-500 text-sm">
                    これまでのレビュー履歴や成長推移を確認できます。スキルレベルと改善ポイントも確認できます。
                  </p>
                </div>
                <div className="mt-auto pt-4">
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/progress">確認する</Link>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
