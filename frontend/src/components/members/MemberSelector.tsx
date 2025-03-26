// frontend/src/components/members/MemberSelector.tsx
import { useState, useEffect } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  UserX,
  Users,
  Search,
  X,
  Check,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface User {
  id: number;
  name: string;
  email: string;
  department?: string;
  join_year?: number;
}

interface SelectedMember {
  id: number;
  name: string;
  role: string;
}

interface MemberSelectorProps {
  token: string;
  selectedMembers: SelectedMember[];
  onMembersChange: (members: SelectedMember[]) => void;
  availableRoles: { value: string; label: string }[];
  defaultRole?: string;
  excludeUserIds?: number[];
  showFilters?: boolean;
}

export const MemberSelector: React.FC<MemberSelectorProps> = ({
  token,
  selectedMembers,
  onMembersChange,
  availableRoles,
  defaultRole = "member",
  excludeUserIds = [],
  showFilters = true,
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedRole, setSelectedRole] = useState(defaultRole);

  // 部署フィルター用の状態
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");

  // 入社年フィルター用の状態
  const [joinYears, setJoinYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");

  // 全ユーザーデータを取得
  const fetchUsers = async () => {
    if (!token) return;

    setIsLoading(true);
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

      // 既に選択されているユーザーとexcludeUserIdsを除外
      const excludeIds = [
        ...excludeUserIds,
        ...selectedMembers.map((member) => member.id),
      ];

      const availableUsers = data.data.filter(
        (user: User) => !excludeIds.includes(user.id)
      );

      setUsers(availableUsers);
      setFilteredUsers(availableUsers);

      // 部署リストの作成
      const deptSet = new Set<string>();
      availableUsers.forEach((user: User) => {
        if (user.department) {
          deptSet.add(user.department);
        }
      });
      setDepartments(Array.from(deptSet).sort());

      // 入社年リストの作成
      const yearSet = new Set<number>();
      availableUsers.forEach((user: User) => {
        if (user.join_year) {
          yearSet.add(user.join_year);
        }
      });
      setJoinYears(Array.from(yearSet).sort((a, b) => b - a)); // 新しい年が上に来るように降順ソート
    } catch (error) {
      console.error("従業員取得エラー:", error);
      toast({
        title: "エラー",
        description: "従業員一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ダイアログが開かれたときにユーザー一覧を取得
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setSelectedUsers([]);
    }
  }, [isOpen, token]);

  // 検索とフィルタリング
  useEffect(() => {
    let filtered = [...users];

    // 検索クエリでフィルタリング
    if (searchQuery) {
      filtered = filtered.filter(
        (user) =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 部署でフィルタリング
    if (selectedDepartment) {
      filtered = filtered.filter(
        (user) => user.department === selectedDepartment
      );
    }

    // 入社年でフィルタリング
    if (selectedYear) {
      const year = parseInt(selectedYear);
      filtered = filtered.filter((user) => user.join_year === year);
    }

    setFilteredUsers(filtered);
  }, [searchQuery, selectedDepartment, selectedYear, users]);

  // フィルターのリセット
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("");
    setSelectedYear("");
  };

  // ユーザーの選択状態を切り替え
  const toggleUser = (userId: number) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter((id) => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  // 全ユーザーを選択/解除
  const toggleAllUsers = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map((user) => user.id));
    }
  };

  // 選択を確定
  const confirmSelection = () => {
    // 選択したユーザーの詳細情報を取得
    const newSelectedMembers = selectedUsers.map((userId) => {
      const user = users.find((u) => u.id === userId);
      return {
        id: userId,
        name: user ? user.name : `User ${userId}`,
        role: selectedRole,
      };
    });

    // 既存の選択と新しい選択を結合
    const updatedMembers = [...selectedMembers, ...newSelectedMembers];
    onMembersChange(updatedMembers);
    setIsOpen(false);
  };

  // 選択メンバーの役割を更新
  const updateMemberRole = (memberId: number, newRole: string) => {
    const updatedMembers = selectedMembers.map((member) =>
      member.id === memberId ? { ...member, role: newRole } : member
    );
    onMembersChange(updatedMembers);
  };

  // メンバーを削除
  const removeMember = (memberId: number) => {
    const updatedMembers = selectedMembers.filter(
      (member) => member.id !== memberId
    );
    onMembersChange(updatedMembers);
  };

  // 全メンバーの役割を一括更新
  const updateAllMembersRole = (newRole: string) => {
    const updatedMembers = selectedMembers.map((member) => ({
      ...member,
      role: newRole,
    }));
    onMembersChange(updatedMembers);
  };

  return (
    <div className="space-y-2">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={isLoading}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {selectedMembers.length > 0
              ? `${selectedMembers.length}人のメンバーを選択中`
              : "メンバーを追加"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>メンバーの選択</DialogTitle>
            <DialogDescription>
              追加するメンバーを選択し、役割を設定してください
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* 検索バー */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Command className="rounded-lg border shadow-md">
                  <CommandInput
                    placeholder="名前またはメールで検索..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    className="h-9 pl-8"
                  />
                </Command>
              </div>
            </div>

            {/* フィルター */}
            {showFilters && (
              <div>
                <div className="flex items-center mb-2">
                  <SlidersHorizontal className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="text-sm font-medium">フィルター</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="ml-auto text-xs"
                  >
                    リセット
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Select
                      value={selectedDepartment}
                      onValueChange={setSelectedDepartment}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="部署で絞り込み" />
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
                  <div>
                    <Select
                      value={selectedYear}
                      onValueChange={setSelectedYear}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="入社年で絞り込み" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">すべての入社年</SelectItem>
                        {joinYears.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}年
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* 役割選択 */}
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">役割: </label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="役割を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 選択ボタン */}
            <div className="flex items-center mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllUsers}
                className="text-xs"
              >
                {selectedUsers.length === filteredUsers.length
                  ? "すべて解除"
                  : "すべて選択"}
              </Button>
              <div className="ml-auto text-sm text-gray-500">
                {selectedUsers.length}人選択中
              </div>
            </div>

            {/* ユーザーリスト */}
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">ユーザーを読み込み中...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center p-6 bg-gray-50 rounded-md">
                {users.length === 0
                  ? "メンバーが見つかりません"
                  : "検索条件に一致するユーザーがいません"}
              </div>
            ) : (
              <div className="overflow-y-auto max-h-60 border rounded-md">
                <div className="divide-y">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 ${
                        selectedUsers.includes(user.id) ? "bg-gray-50" : ""
                      }`}
                      onClick={() => toggleUser(user.id)}
                    >
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={() => toggleUser(user.id)}
                        className="mr-3"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-sm text-gray-500 truncate">
                          {user.email}
                        </div>
                      </div>
                      <div className="text-sm text-right">
                        {user.department && (
                          <div className="text-gray-600">{user.department}</div>
                        )}
                        {user.join_year && (
                          <div className="text-gray-500">
                            {user.join_year}年入社
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={confirmSelection}
              disabled={selectedUsers.length === 0}
            >
              {selectedUsers.length > 0
                ? `${selectedUsers.length}人のメンバーを追加`
                : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 選択済みメンバー表示 */}
      {selectedMembers.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm font-medium">選択中のメンバー:</div>
            {selectedMembers.length > 1 && (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">一括設定: </span>
                <Select onValueChange={updateAllMembersRole}>
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue placeholder="役割を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {selectedMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div className="font-medium">{member.name}</div>
                <div className="flex items-center space-x-2">
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      updateMemberRole(member.id, value)
                    }
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue placeholder="役割" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMember(member.id)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
