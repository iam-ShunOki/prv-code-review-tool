// frontend/src/components/backlog/RepositorySelector.tsx
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch,
  Search,
  Plus,
  Check,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// リポジトリデータの型定義
interface Repository {
  id: string;
  name: string;
  description: string | null;
  sshUrl: string;
  httpUrl: string;
  defaultBranch: string;
}

// プロジェクトデータの型定義
interface Project {
  id: string;
  projectKey: string;
  name: string;
  chartEnabled: boolean;
  useResolvedVersion: boolean;
  archived: boolean;
}

interface RepositorySelectorProps {
  token: string;
  selectedRepositories: string[];
  onRepositoriesChange: (repositories: string[]) => void;
  backlogProjectKey?: string;
  onBacklogProjectKeyChange?: (projectKey: string) => void;
}

export const RepositorySelector: React.FC<RepositorySelectorProps> = ({
  token,
  selectedRepositories,
  onRepositoriesChange,
  backlogProjectKey,
  onBacklogProjectKeyChange,
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelectedRepos, setLocalSelectedRepos] = useState<string[]>([]);

  // プロジェクト一覧を取得
  const fetchProjects = async () => {
    if (!token) return;

    setIsLoadingProjects(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/projects`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Backlogプロジェクト一覧の取得に失敗しました");
      }

      const { data } = await response.json();
      const activeProjects = data.filter((p: Project) => !p.archived);
      setProjects(activeProjects);

      // プロジェクトキーが存在する場合は選択する
      if (
        backlogProjectKey &&
        activeProjects.some((p: Project) => p.projectKey === backlogProjectKey)
      ) {
        setSelectedProject(backlogProjectKey);
        fetchRepositories(backlogProjectKey);
      }
    } catch (error) {
      console.error("Backlogプロジェクト取得エラー:", error);
      toast({
        title: "エラー",
        description: "Backlogプロジェクト一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // リポジトリ一覧を取得
  const fetchRepositories = async (projectKey: string) => {
    if (!token || !projectKey) return;

    setIsLoadingRepositories(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backlog/projects/${projectKey}/repositories`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("リポジトリ一覧の取得に失敗しました");
      }

      const { data } = await response.json();
      setRepositories(data);
      setLocalSelectedRepos(selectedRepositories);
    } catch (error) {
      console.error("リポジトリ取得エラー:", error);
      toast({
        title: "エラー",
        description: "リポジトリ一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoadingRepositories(false);
    }
  };

  // ダイアログが開かれたときにプロジェクト一覧を取得
  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setLocalSelectedRepos(selectedRepositories);
    }
  }, [isOpen, token]);

  // プロジェクトが変更されたときにリポジトリ一覧を取得
  useEffect(() => {
    if (selectedProject) {
      fetchRepositories(selectedProject);

      // 親コンポーネントにBacklogプロジェクトキーを通知
      if (onBacklogProjectKeyChange) {
        onBacklogProjectKeyChange(selectedProject);
      }
    }
  }, [selectedProject]);

  // 検索でフィルタリングされたリポジトリを取得
  const filteredRepositories = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // リポジトリの選択状態を切り替え
  const toggleRepository = (repoName: string) => {
    const newSelectedRepos = localSelectedRepos.includes(repoName)
      ? localSelectedRepos.filter((r) => r !== repoName)
      : [...localSelectedRepos, repoName];

    setLocalSelectedRepos(newSelectedRepos);
  };

  // 選択を確定
  const confirmSelection = () => {
    onRepositoriesChange(localSelectedRepos);
    setIsOpen(false);
  };

  // リポジトリ選択をクリア
  const clearSelection = () => {
    setLocalSelectedRepos([]);
  };

  // 全リポジトリを選択
  const selectAllRepositories = () => {
    setLocalSelectedRepos(repositories.map((repo) => repo.name));
  };

  return (
    <div className="space-y-2">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full justify-start">
            <GitBranch className="mr-2 h-4 w-4" />
            {selectedRepositories.length > 0
              ? `${selectedRepositories.length}個のリポジトリを選択中`
              : "Backlogリポジトリを選択"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Backlogリポジトリの選択</DialogTitle>
            <DialogDescription>
              連携するBacklogプロジェクトとリポジトリを選択してください
            </DialogDescription>
          </DialogHeader>

          {/* プロジェクト選択 */}
          <div className="space-y-4 mt-2">
            <div>
              <FormLabel>Backlogプロジェクト</FormLabel>
              <Select
                value={selectedProject}
                onValueChange={setSelectedProject}
                disabled={isLoadingProjects}
              >
                <SelectTrigger className="w-full">
                  {isLoadingProjects ? (
                    <span className="flex items-center">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      読み込み中...
                    </span>
                  ) : (
                    <SelectValue placeholder="プロジェクトを選択" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.projectKey}>
                      {project.name} ({project.projectKey})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProject && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <FormLabel>リポジトリ</FormLabel>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                      disabled={localSelectedRepos.length === 0}
                    >
                      クリア
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllRepositories}
                      disabled={repositories.length === 0}
                    >
                      全て選択
                    </Button>
                  </div>
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="リポジトリを検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {isLoadingRepositories ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">リポジトリを読み込み中...</span>
                  </div>
                ) : repositories.length === 0 ? (
                  <div className="text-center p-6 bg-gray-50 rounded-md">
                    リポジトリが見つかりません
                  </div>
                ) : filteredRepositories.length === 0 ? (
                  <div className="text-center p-6 bg-gray-50 rounded-md">
                    検索条件に一致するリポジトリがありません
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredRepositories.map((repo) => (
                      <Card
                        key={repo.id}
                        className={`cursor-pointer transition-colors ${
                          localSelectedRepos.includes(repo.name)
                            ? "border-primary"
                            : ""
                        }`}
                        onClick={() => toggleRepository(repo.name)}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center">
                                <GitBranch className="h-4 w-4 mr-2 text-gray-500" />
                                <span className="font-medium">{repo.name}</span>
                                {localSelectedRepos.includes(repo.name) && (
                                  <Check className="h-4 w-4 ml-2 text-green-500" />
                                )}
                              </div>
                              {repo.description && (
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                  {repo.description}
                                </p>
                              )}
                              <div className="mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {repo.defaultBranch || "master"}
                                </Badge>
                              </div>
                            </div>
                            <a
                              href={repo.httpUrl.slice(0, -4)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-2 text-gray-500 hover:text-gray-700"
                              title="Backlogで開く"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
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
              disabled={!selectedProject}
            >
              {localSelectedRepos.length > 0
                ? `${localSelectedRepos.length}個のリポジトリを選択`
                : "選択を確定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 選択済みリポジトリ表示 */}
      {selectedRepositories.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="text-sm font-medium">選択中のリポジトリ:</div>
          <div className="flex flex-wrap gap-2">
            {selectedRepositories.map((repo) => (
              <Badge key={repo} variant="outline" className="flex items-center">
                <GitBranch className="h-3 w-3 mr-1" />
                {repo}
                <button
                  type="button"
                  className="ml-1 text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    const newRepos = selectedRepositories.filter(
                      (r) => r !== repo
                    );
                    onRepositoriesChange(newRepos);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
