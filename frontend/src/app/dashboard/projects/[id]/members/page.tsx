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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  UserPlus,
  Users,
  Trash2,
  ArrowLeft,
  Search,
  X,
  Edit,
  Check,
} from "lucide-react";

// プロジェクトの型定義
interface Project {
  id: number;
  name: string;
  code: string;
}

// メンバーの型定義
interface ProjectMember {
  id: number;
  user_id: number;
  role: "leader" | "member" | "reviewer" | "observer";
  joined_at: string;
  user: {
    id: number;
    name: string;
    email: string;
    department: string | null;
    join_year: number | null;
  };
}

// 従業員の型定義
interface Employee {
  id: number;
  name: string;
  email: string;
  department: string | null;
  join_year: number | null;
}

export default function ProjectMembersPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [editRole, setEditRole] = useState<string>("");
  const isAdmin = user?.role === "admin";

  // プロジェクトとメンバー情報を取得
  useEffect(() => {
    const fetchProjectData = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        // プロジェクト詳細を取得
        const projectResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!projectResponse.ok) {
          throw new Error("プロジェクト情報の取得に失敗しました");
        }

        const projectData = await projectResponse.json();
        setProject(projectData.data);

        // プロジェクトメンバーを取得
        const membersResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}/members`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!membersResponse.ok) {
          throw new Error("メンバー情報の取得に失敗しました");
        }

        const membersData = await membersResponse.json();
        setMembers(membersData.data || []);
      } catch (error) {
        console.error("プロジェクトデータ取得エラー:", error);
        toast({
          title: "エラー",
          description: "プロジェクト情報の取得に失敗しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjectData();
  }, [params.id, token, toast]);

  // 全従業員の取得
  const fetchEmployees = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/employees`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("従業員一覧の取得に失敗しました");
      }

      const data = await response.json();

      // 既存メンバーを除外
      const existingMemberIds = members.map((member) => member.user_id);
      const availableEmployees = data.data.filter(
        (emp: Employee) => !existingMemberIds.includes(emp.id)
      );

      setEmployees(availableEmployees);
      setFilteredEmployees(availableEmployees);
    } catch (error) {
      console.error("従業員取得エラー:", error);
      toast({
        title: "エラー",
        description: "従業員一覧の取得に失敗しました",
        variant: "destructive",
      });
    }
  };

  // メンバー追加モードの開始
  const handleStartAddMember = async () => {
    setIsAddingMember(true);
    await fetchEmployees();
  };

  // 検索機能
  useEffect(() => {
    if (searchQuery) {
      const filtered = employees.filter(
        (emp) =>
          emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (emp.department &&
            emp.department.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredEmployees(filtered);
    } else {
      setFilteredEmployees(employees);
    }
  }, [searchQuery, employees]);

  // メンバー追加
  const handleAddMember = async () => {
    if (!selectedUserId) {
      toast({
        title: "エラー",
        description: "ユーザーを選択してください",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: selectedUserId,
            role: selectedRole,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("メンバーの追加に失敗しました");
      }

      const data = await response.json();

      // メンバー一覧を更新
      const newMember = data.data;
      const selectedEmployee = employees.find(
        (emp) => emp.id === selectedUserId
      );

      if (selectedEmployee && newMember) {
        const memberWithUser = {
          ...newMember,
          user: selectedEmployee,
        };

        setMembers([...members, memberWithUser]);
      }

      setIsAddingMember(false);
      setSelectedUserId(0);
      setSelectedRole("member");

      toast({
        title: "メンバーを追加しました",
        description: "プロジェクトメンバーが正常に追加されました",
      });
    } catch (error) {
      console.error("メンバー追加エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "メンバーの追加に失敗しました",
        variant: "destructive",
      });
    }
  };

  // メンバー削除
  const handleRemoveMember = async (userId: number) => {
    const confirm = window.confirm(
      "このメンバーをプロジェクトから削除しますか？"
    );
    if (!confirm) return;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}/members/${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("メンバーの削除に失敗しました");
      }

      // メンバー一覧を更新
      setMembers(members.filter((member) => member.user_id !== userId));

      toast({
        title: "メンバーを削除しました",
        description: "プロジェクトからメンバーを削除しました",
      });
    } catch (error) {
      console.error("メンバー削除エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "メンバーの削除に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 役割の編集開始
  const handleStartEditRole = (member: ProjectMember) => {
    setEditingMemberId(member.id);
    setEditRole(member.role);
  };

  // 役割の更新
  const handleUpdateRole = async (memberId: number, userId: number) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${params.id}/members/${userId}/role`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            role: editRole,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("役割の更新に失敗しました");
      }

      // メンバー一覧を更新
      setMembers(
        members.map((member) =>
          member.id === memberId ? { ...member, role: editRole as any } : member
        )
      );

      setEditingMemberId(null);

      toast({
        title: "役割を更新しました",
        description: "メンバーの役割が正常に更新されました",
      });
    } catch (error) {
      console.error("役割更新エラー:", error);
      toast({
        title: "エラー",
        description:
          error instanceof Error ? error.message : "役割の更新に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 役割名を表示
  const getRoleName = (role: string) => {
    switch (role) {
      case "leader":
        return "リーダー";
      case "member":
        return "メンバー";
      case "reviewer":
        return "レビュアー";
      case "observer":
        return "オブザーバー";
      default:
        return role;
    }
  };

  // 管理者権限チェック
  if (!isLoading && !isAdmin) {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">管理者権限が必要です</h2>
        <p className="mt-2 text-gray-500">
          プロジェクトメンバーの管理には管理者権限が必要です。
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/dashboard/projects/${params.id}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> プロジェクト詳細に戻る
        </Button>
      </div>
    );
  }

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
          <p className="mt-2">プロジェクト情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center p-10">
        <h2 className="text-xl font-semibold">プロジェクトが見つかりません</h2>
        <p className="mt-2 text-gray-500">
          指定されたプロジェクトは存在しないか、アクセス権がありません。
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/dashboard/projects")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> プロジェクト一覧に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/projects/${params.id}`)}
          className="self-start"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> プロジェクト詳細に戻る
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            {project.name} のメンバー管理
          </CardTitle>
          <CardDescription>
            プロジェクトメンバーの追加、削除、役割の変更ができます
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAddingMember ? (
            <div className="mb-6 bg-gray-50 p-4 rounded-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">メンバーを追加</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingMember(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-2 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="名前、メール、部署で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>

              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">ユーザー選択</h4>
                <div className="overflow-auto max-h-60 border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>名前</TableHead>
                        <TableHead>メール</TableHead>
                        <TableHead>部署</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4">
                            条件に一致するユーザーがいません
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEmployees.map((employee) => (
                          <TableRow
                            key={employee.id}
                            className={`cursor-pointer ${
                              selectedUserId === employee.id
                                ? "bg-gray-100"
                                : ""
                            }`}
                            onClick={() => setSelectedUserId(employee.id)}
                          >
                            <TableCell>
                              <input
                                type="radio"
                                name="selectedUser"
                                checked={selectedUserId === employee.id}
                                onChange={() => setSelectedUserId(employee.id)}
                                className="h-4 w-4"
                              />
                            </TableCell>
                            <TableCell>{employee.name}</TableCell>
                            <TableCell>{employee.email}</TableCell>
                            <TableCell>{employee.department || "-"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">役割</label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="役割を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leader">リーダー</SelectItem>
                      <SelectItem value="member">メンバー</SelectItem>
                      <SelectItem value="reviewer">レビュアー</SelectItem>
                      <SelectItem value="observer">オブザーバー</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsAddingMember(false)}
                >
                  キャンセル
                </Button>
                <Button onClick={handleAddMember} disabled={!selectedUserId}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  メンバーを追加
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <Button onClick={handleStartAddMember}>
                <UserPlus className="h-4 w-4 mr-2" />
                メンバーを追加
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>役割</TableHead>
                <TableHead>部署</TableHead>
                <TableHead>参加日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    プロジェクトにメンバーがいません
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.user.name}
                    </TableCell>
                    <TableCell>{member.user.email}</TableCell>
                    <TableCell>
                      {editingMemberId === member.id ? (
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="leader">リーダー</SelectItem>
                            <SelectItem value="member">メンバー</SelectItem>
                            <SelectItem value="reviewer">レビュアー</SelectItem>
                            <SelectItem value="observer">
                              オブザーバー
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">
                          {getRoleName(member.role)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{member.user.department || "-"}</TableCell>
                    <TableCell>
                      {new Date(member.joined_at).toLocaleDateString("ja-JP")}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingMemberId === member.id ? (
                        <div className="flex justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingMemberId(null)}
                            title="キャンセル"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleUpdateRole(member.id, member.user_id)
                            }
                            title="保存"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStartEditRole(member)}
                            title="役割を編集"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMember(member.user_id)}
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
