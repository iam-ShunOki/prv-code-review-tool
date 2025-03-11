import bcrypt from "bcrypt";
import { AppDataSource } from "../index";
import { User, UserRole } from "../models/User";

export class UserService {
  private userRepository = AppDataSource.getRepository(User);

  /**
   * ユーザーを作成する
   */
  async createUser(userData: {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
    department?: string;
    join_year?: number;
  }): Promise<User> {
    // メールアドレスの重複チェック
    const existingUser = await this.userRepository.findOne({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new Error("このメールアドレスは既に使用されています");
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // ユーザーオブジェクトの作成
    const user = this.userRepository.create({
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      role: userData.role || UserRole.TRAINEE,
      department: userData.department,
      join_year: userData.join_year,
    });

    // ユーザーの保存
    return this.userRepository.save(user);
  }

  /**
   * メールアドレスからユーザーを検索する
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  /**
   * IDからユーザーを検索する
   */
  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * パスワードを検証する
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  /**
   * 全ユーザーを取得する（管理者用）
   */
  async getAllUsers(): Promise<User[]> {
    return this.userRepository.find();
  }

  /**
   * 年度で絞り込んだ新入社員を取得する（管理者用）
   */
  async getTraineesByYear(joinYear: number): Promise<User[]> {
    return this.userRepository.find({
      where: {
        role: UserRole.TRAINEE,
        join_year: joinYear,
      },
    });
  }

  /**
   * ユーザー情報を更新する
   */
  async updateUser(
    id: number,
    userData: Partial<{
      name: string;
      email: string;
      department: string;
      join_year: number;
    }>
  ): Promise<User> {
    await this.userRepository.update(id, userData);
    const updatedUser = await this.findById(id);
    if (!updatedUser) {
      throw new Error("ユーザーが見つかりません");
    }
    return updatedUser;
  }

  /**
   * パスワードを更新する
   */
  async updatePassword(id: number, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(id, { password: hashedPassword });
  }
  /**
   * フィルター条件を指定して社員を取得する
   */
  async getFilteredEmployees(
    joinYear?: number,
    department?: string
  ): Promise<User[]> {
    const whereConditions: any = {};

    if (joinYear) {
      whereConditions.join_year = joinYear;
    }

    if (department) {
      whereConditions.department = department;
    }

    const users = await this.userRepository.find({
      where: whereConditions,
      order: {
        join_year: "DESC",
        name: "ASC",
      },
    });

    // パスワードを除外してから返す
    return users.map((user) => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword as User;
    });
  }

  /**
   * 入社年度の一覧を取得
   */
  async getDistinctJoinYears(): Promise<number[]> {
    const result = await this.userRepository
      .createQueryBuilder("user")
      .select("DISTINCT user.join_year", "join_year")
      .where("user.join_year IS NOT NULL")
      .orderBy("user.join_year", "DESC")
      .getRawMany();

    return result.map((item) => item.join_year);
  }

  /**
   * 部署の一覧を取得
   */
  async getDistinctDepartments(): Promise<string[]> {
    const result = await this.userRepository
      .createQueryBuilder("user")
      .select("DISTINCT user.department", "department")
      .where("user.department IS NOT NULL")
      .orderBy("user.department", "ASC")
      .getRawMany();

    return result.map((item) => item.department);
  }
}
