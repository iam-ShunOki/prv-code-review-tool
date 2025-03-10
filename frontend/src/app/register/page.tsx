"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    join_year: new Date().getFullYear(),
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "join_year" ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        department: formData.department || undefined,
        join_year: formData.join_year,
      });
      // 登録成功したらダッシュボードへリダイレクト
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("登録中にエラーが発生しました");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 年度の選択肢を生成
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold tracking-tight">
            コードレビューツール
          </h1>
          <h2 className="mt-6 text-center text-2xl font-bold tracking-tight">
            新規アカウント登録
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                氏名
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm py-1.5 px-3 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm py-1.5 px-3 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm py-1.5 px-3 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            <div>
              <label
                htmlFor="department"
                className="block text-sm font-medium text-gray-700"
              >
                所属部署
              </label>
              <input
                id="department"
                name="department"
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm py-1.5 px-3 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                value={formData.department}
                onChange={handleChange}
              />
            </div>

            <div>
              <label
                htmlFor="join_year"
                className="block text-sm font-medium text-gray-700"
              >
                入社年度
              </label>
              <select
                id="join_year"
                name="join_year"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm py-1.5 px-3 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
                value={formData.join_year}
                onChange={handleChange}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}年度
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-400"
            >
              {isLoading ? "登録中..." : "アカウント登録"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link
                href="/login"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                すでにアカウントをお持ちの方はこちら
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
