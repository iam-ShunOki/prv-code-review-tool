// frontend/src/app/dashboard/employees/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Search, Users, FilterX } from "lucide-react";

// 社員情報の型定義
interface Employee {
  id: number;
  name: string;
  email: string;
  role: "admin" | "trainee";
  department?: string;
  join_year?: number;
  created_at: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [joinYears, setJoinYears] = useState<number[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10; // 1ページあたりの表示数
  const { token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // 社員一覧を取得
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        let url = `${process.env.NEXT_PUBLIC_API_URL}/api/employees`;
        const queryParams = [];

        if (selectedYear) {
          queryParams.push(`joinYear=${selectedYear}`);
        }

        if (selectedDepartment) {
          queryParams.push(
            `department=${encodeURIComponent(selectedDepartment)}`
          );
        }

        if (queryParams.length > 0) {
          url += `?${queryParams.join("&")}`;
        }

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("社員一覧の取得に失敗しました");
        }

        const data = await response.json();
        setEmployees(data.data);
        setFilteredEmployees(data.data);

        // 検索条件が変わった場合、ページを1に戻す
        setCurrentPage(1);
      } catch (error) {
        console.error("社員一覧取得エラー:", error);
        toast({
          title: "エラーが発生しました",
          description: "社員一覧の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    // 入社年度一覧を取得
    const fetchJoinYears = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/employees/join-years`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setJoinYears(data.data);
        }
      } catch (error) {
        console.error("入社年度一覧取得エラー:", error);
      }
    };

    // 部署一覧を取得
    const fetchDepartments = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/employees/departments`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setDepartments(data.data);
        }
      } catch (error) {
        console.error("部署一覧取得エラー:", error);
      }
    };

    if (token) {
      fetchEmployees();
      fetchJoinYears();
      fetchDepartments();
    }
  }, [token, toast, selectedYear, selectedDepartment]);

  // 検索処理
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredEmployees(employees);
    } else {
      const filtered = employees.filter(
        (employee) =>
          employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          employee.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (employee.department &&
            employee.department
              .toLowerCase()
              .includes(searchQuery.toLowerCase()))
      );
      setFilteredEmployees(filtered);
    }

    // 検索条件が変わった場合、ページを1に戻す
    setCurrentPage(1);

    // 総ページ数を計算
    const filtered = searchQuery.trim() === "" ? employees : filteredEmployees;
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  }, [searchQuery, employees]);

  // フィルタされた社員リストが変わったら総ページ数を再計算
  useEffect(() => {
    setTotalPages(Math.ceil(filteredEmployees.length / itemsPerPage));
  }, [filteredEmployees]);

  // フィルタをリセット
  const resetFilters = () => {
    setSelectedYear("");
    setSelectedDepartment("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  // 現在のページのデータを取得
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEmployees.slice(startIndex, endIndex);
  };

  // ページネーションリンクを生成する関数
  const renderPaginationLinks = () => {
    const pageItems = [];
    const maxDisplayedPages = 5; // 最大表示ページ数

    // 最初のページへのリンク（常に表示）
    pageItems.push(
      <PaginationItem key="first">
        <PaginationLink
          isActive={currentPage === 1}
          onClick={() => setCurrentPage(1)}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    // 左の省略記号（必要な場合）
    if (currentPage > 3) {
      pageItems.push(
        <PaginationItem key="ellipsis-left">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // 中間のページリンク
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      if (i === 1 || i === totalPages) continue; // 最初と最後のページは別に処理
      pageItems.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // 右の省略記号（必要な場合）
    if (currentPage < totalPages - 2) {
      pageItems.push(
        <PaginationItem key="ellipsis-right">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // 最後のページへのリンク（常に表示、ただし最初のページと同じ場合は非表示）
    if (totalPages > 1) {
      pageItems.push(
        <PaginationItem key="last">
          <PaginationLink
            isActive={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return pageItems;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div
            className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full"
            role="status"
          >
            <span className="visually-hidden"></span>
          </div>
          <p className="mt-2">社員情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">社員管理</h1>
          <p className="text-gray-500 mt-1">新入社員の一覧と詳細情報の管理</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>フィルタと検索</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/4">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="入社年度を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべての年度</SelectItem>
                  {joinYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}年度
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-1/4">
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="部署を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべての部署</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-1/3 relative">
              <Input
                type="text"
                placeholder="社員名または部署名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            </div>
            <div className="w-full md:w-auto">
              <Button
                variant="outline"
                onClick={resetFilters}
                className="w-full"
              >
                <FilterX className="mr-2 h-4 w-4" />
                リセット
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>社員一覧</CardTitle>
            <p className="text-sm text-gray-500">
              合計: {filteredEmployees.length}名
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEmployees.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">
                社員が見つかりません
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                検索条件に一致する社員が見つかりませんでした。
              </p>
              <div className="mt-6">
                <Button onClick={resetFilters}>フィルタをリセット</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>社員ID</TableHead>
                      <TableHead>氏名</TableHead>
                      <TableHead>メールアドレス</TableHead>
                      <TableHead>入社年度</TableHead>
                      <TableHead>部署</TableHead>
                      <TableHead>権限</TableHead>
                      <TableHead>登録日</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getCurrentPageData().map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>{employee.id}</TableCell>
                        <TableCell className="font-medium">
                          {employee.name}
                        </TableCell>
                        <TableCell>{employee.email}</TableCell>
                        <TableCell>
                          {employee.join_year
                            ? `${employee.join_year}年度`
                            : "-"}
                        </TableCell>
                        <TableCell>{employee.department || "-"}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              employee.role === "admin"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {employee.role === "admin" ? "管理者" : "新入社員"}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(employee.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              router.push(`/dashboard/employees/${employee.id}`)
                            }
                          >
                            詳細
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* ページネーション */}
              {totalPages > 1 && (
                <Pagination className="my-4">
                  <PaginationContent>
                    {/* 前のページへのリンク */}
                    {currentPage > 1 && (
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(currentPage - 1)}
                        />
                      </PaginationItem>
                    )}

                    {/* ページ番号リンク */}
                    {renderPaginationLinks()}

                    {/* 次のページへのリンク */}
                    {currentPage < totalPages && (
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(currentPage + 1)}
                        />
                      </PaginationItem>
                    )}
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
