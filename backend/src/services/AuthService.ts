import { randomBytes } from "crypto";
import { UserService } from "./UserService";
import { User } from "../models/User";
import { Session } from "../models/Session";
import { AppDataSource } from "../index";

export class AuthService {
  private userService: UserService;
  private sessionRepository = AppDataSource.getRepository(Session);
  private sessionExpiryDays: number;

  constructor() {
    this.userService = new UserService();
    this.sessionExpiryDays = 7; // セッション有効期限（日数）
  }

  /**
   * ユーザー登録
   */
  async register(userData: {
    name: string;
    email: string;
    password: string;
    department?: string;
    join_year?: number;
  }): Promise<{ user: Omit<User, "password">; sessionToken: string }> {
    // ユーザーを作成
    const user = await this.userService.createUser(userData);

    // セッショントークンを生成
    const sessionToken = await this.createSession(user);

    // パスワードを除外したユーザー情報を返す
    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword as Omit<User, "password">,
      sessionToken,
    };
  }

  /**
   * ログイン認証
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: Omit<User, "password">; sessionToken: string }> {
    // メールアドレスでユーザーを検索
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new Error("メールアドレスまたはパスワードが正しくありません");
    }

    // パスワードの検証
    const isPasswordValid = await this.userService.validatePassword(
      user,
      password
    );
    if (!isPasswordValid) {
      throw new Error("メールアドレスまたはパスワードが正しくありません");
    }

    // 既存のセッションがあれば削除（オプション：複数デバイスログインを許可する場合は不要）
    await this.invalidateUserSessions(user.id);

    // 新しいセッションを作成
    const sessionToken = await this.createSession(user);

    // パスワードを除外したユーザー情報を返す
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword as Omit<User, "password">,
      sessionToken,
    };
  }

  /**
   * トークンからユーザー情報を取得
   */
  async validateSession(
    sessionToken: string
  ): Promise<Omit<User, "password"> | null> {
    try {
      // トークンでセッションを検索
      const session = await this.sessionRepository.findOne({
        where: { session_token: sessionToken },
        relations: ["user"],
      });

      // セッションが見つからない場合
      if (!session) {
        return null;
      }

      // セッションの有効期限をチェック
      if (new Date() > session.expires_at) {
        // 期限切れのセッションを削除
        await this.sessionRepository.remove(session);
        return null;
      }

      // パスワードを除外したユーザー情報を返す
      const { password, ...userWithoutPassword } = session.user;
      return userWithoutPassword as Omit<User, "password">;
    } catch (error) {
      console.error("セッション検証エラー:", error);
      return null;
    }
  }

  /**
   * ログアウト（セッション削除）
   */
  async logout(sessionToken: string): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { session_token: sessionToken },
      });

      if (session) {
        await this.sessionRepository.remove(session);
      }

      return true;
    } catch (error) {
      console.error("ログアウトエラー:", error);
      return false;
    }
  }

  /**
   * セッションを作成してトークンを返す
   */
  private async createSession(user: User): Promise<string> {
    // ランダムなトークンを生成
    const sessionToken = randomBytes(64).toString("hex");

    // 有効期限を設定
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.sessionExpiryDays);

    // セッションをデータベースに保存
    const session = this.sessionRepository.create({
      user_id: user.id,
      session_token: sessionToken,
      expires_at: expiresAt,
    });

    await this.sessionRepository.save(session);

    return sessionToken;
  }

  /**
   * ユーザーの全セッションを無効化
   */
  private async invalidateUserSessions(userId: number): Promise<void> {
    const sessions = await this.sessionRepository.find({
      where: { user_id: userId },
    });

    if (sessions.length > 0) {
      await this.sessionRepository.remove(sessions);
    }
  }
}
