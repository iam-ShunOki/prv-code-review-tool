import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "trainee";
  department?: string;
  join_year?: number;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    name: string;
    email: string;
    password: string;
    department?: string;
    join_year?: number;
  }) => Promise<void>;
  logout: () => void;
  updateUser: (userData: User) => void; // 追加
};

// コンテキストの作成
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// コンテキストプロバイダーコンポーネント
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ページロード時に認証状態を確認
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // ローカルストレージからセッショントークンを取得
        const savedToken = localStorage.getItem("sessionToken");
        if (savedToken) {
          // トークンを使ってユーザー情報を取得
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`,
            {
              headers: {
                Authorization: `Bearer ${savedToken}`,
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            setUser(data.data.user);
            setToken(savedToken);
          } else {
            // トークンが無効な場合はログアウト
            localStorage.removeItem("sessionToken");
          }
        }
      } catch (error) {
        console.error("認証エラー:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // ログイン関数
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "ログインに失敗しました");
      }

      const data = await response.json();
      setUser(data.data.user);
      setToken(data.data.sessionToken);

      // トークンをローカルストレージに保存
      localStorage.setItem("sessionToken", data.data.sessionToken);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("ログイン処理中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 登録関数
  const register = async (userData: {
    name: string;
    email: string;
    password: string;
    department?: string;
    join_year?: number;
  }) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "登録に失敗しました");
      }

      const data = await response.json();
      setUser(data.data.user);
      setToken(data.data.sessionToken);

      // トークンをローカルストレージに保存
      localStorage.setItem("sessionToken", data.data.sessionToken);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("登録処理中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // ログアウト関数
  const logout = async () => {
    if (token) {
      try {
        // サーバーサイドでのログアウト処理
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("ログアウトエラー:", error);
      }
    }

    // ローカルステートをクリア
    setUser(null);
    setToken(null);
    localStorage.removeItem("sessionToken");
  };

  const updateUser = (userData: User) => {
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// カスタムフック
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
