// backend/src/services/ProjectService.ts - 修正版
import { AppDataSource } from "../index";
import { Project, ProjectStatus } from "../models/Project";
import { UserProject, UserProjectRole } from "../models/UserProject";
import { User } from "../models/User";
import { Review } from "../models/Review";
import { In, IsNull } from "typeorm";

export class ProjectService {
  private projectRepository = AppDataSource.getRepository(Project);
  private userProjectRepository = AppDataSource.getRepository(UserProject);
  private userRepository = AppDataSource.getRepository(User);
  private reviewRepository = AppDataSource.getRepository(Review); // Review リポジトリを追加

  /**
   * プロジェクトを作成する
   */
  async createProject(data: {
    name: string;
    code: string;
    description?: string;
    status?: ProjectStatus;
    start_date?: string;
    end_date?: string;
    backlog_project_key?: string;
    backlog_repository_names?: string;
  }): Promise<Project> {
    // コードの重複チェック
    const existingProject = await this.projectRepository.findOne({
      where: { code: data.code },
    });

    if (existingProject) {
      throw new Error(`コード "${data.code}" は既に使用されています`);
    }

    // プロジェクトオブジェクトの作成
    const project = this.projectRepository.create({
      name: data.name,
      code: data.code,
      description: data.description,
      status: data.status || ProjectStatus.ACTIVE,
      start_date: data.start_date ? new Date(data.start_date) : undefined,
      end_date: data.end_date ? new Date(data.end_date) : undefined,
      backlog_project_key: data.backlog_project_key,
      backlog_repository_names: data.backlog_repository_names,
    });

    // プロジェクトの保存
    return this.projectRepository.save(project);
  }

  /**
   * 全てのプロジェクトを取得する
   */
  async getAllProjects(): Promise<Project[]> {
    return this.projectRepository.find({
      order: {
        created_at: "DESC",
      },
    });
  }

  /**
   * ユーザーがプロジェクトのメンバーかどうかを確認
   */
  async isUserProjectMember(
    projectId: number,
    userId: number
  ): Promise<boolean> {
    const userProject = await this.userProjectRepository.findOne({
      where: { project_id: projectId, user_id: userId },
    });

    return !!userProject;
  }

  /**
   * プロジェクトのレビュー一覧を取得（参加メンバー全員のレビューを含む）
   */
  async getProjectReviewsWithDetails(projectId: number): Promise<any[]> {
    // まず、プロジェクトのメンバーIDを取得
    const projectMembers = await this.userProjectRepository.find({
      where: { project_id: projectId },
      select: ["user_id"],
    });

    const memberIds = projectMembers.map((member) => member.user_id);

    // プロジェクトに直接関連付けられたレビューを取得
    const directReviews = await this.reviewRepository.find({
      where: { project_id: projectId },
      relations: ["user", "submissions", "submissions.feedbacks"],
      order: { created_at: "DESC" },
    });

    // プロジェクトメンバーによるレビュー（プロジェクトに直接関連付けられていないもの）を取得
    const memberReviews = await this.reviewRepository.find({
      where: {
        user_id: In(memberIds),
        project_id: IsNull(), // プロジェクトに関連付けられていないもの
      },
      relations: ["user", "submissions", "submissions.feedbacks"],
      order: { created_at: "DESC" },
    });

    // 両方のレビューを結合して返す
    const allReviews = [...directReviews, ...memberReviews];

    // レビューごとに追加情報を計算
    const enrichedReviews = allReviews.map((review) => {
      const lastSubmission = review.submissions.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      const totalFeedbacks = lastSubmission
        ? lastSubmission.feedbacks.length
        : 0;
      const resolvedFeedbacks = lastSubmission
        ? lastSubmission.feedbacks.filter((f) => f.is_resolved).length
        : 0;

      return {
        ...review,
        progress: totalFeedbacks
          ? Math.round((resolvedFeedbacks / totalFeedbacks) * 100)
          : 0,
        submission_count: review.submissions.length,
        // 不要なネストを除去
        submissions: undefined,
      };
    });

    return enrichedReviews;
  }

  /**
   * 特定のユーザーが参加しているプロジェクトを取得
   */
  async getUserProjects(userId: number): Promise<Project[]> {
    const userProjects = await this.userProjectRepository.find({
      where: { user_id: userId },
      relations: ["project"],
    });

    return userProjects.map((up) => up.project);
  }

  /**
   * IDによるプロジェクト取得
   */
  async getProjectById(id: number): Promise<Project | null> {
    return this.projectRepository.findOne({
      where: { id },
      relations: [
        "userProjects",
        "userProjects.user",
        "reviews",
        "reviews.user", // ここにuser関連を明示的に追加
      ],
    });
  }

  /**
   * 特定のプロジェクトに関連するレビュー一覧を取得
   */
  async getProjectReviews(projectId: number): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { project_id: projectId },
      order: { created_at: "DESC" },
      relations: ["user"], // ここでもuser関連を明示的に指定
    });
  }

  /**
   * プロジェクト情報を更新
   */
  async updateProject(
    id: number,
    data: Partial<Project>
  ): Promise<Project | null> {
    await this.projectRepository.update(id, data);
    return this.getProjectById(id);
  }

  /**
   * プロジェクトを削除
   */
  async deleteProject(id: number): Promise<boolean> {
    const result = await this.projectRepository.delete(id);
    // TypeScript エラーを修正: affected が null の可能性に対応
    return (
      result.affected !== undefined &&
      result.affected !== null &&
      result.affected > 0
    );
  }

  /**
   * プロジェクトにメンバーを追加
   */
  async addProjectMember(
    projectId: number,
    userId: number,
    role: UserProjectRole = UserProjectRole.MEMBER
  ): Promise<UserProject> {
    // ユーザーとプロジェクトの存在確認
    const user = await this.userRepository.findOneBy({ id: userId });
    const project = await this.projectRepository.findOneBy({ id: projectId });

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    if (!project) {
      throw new Error("プロジェクトが見つかりません");
    }

    // 既存の関連をチェック
    const existingRelation = await this.userProjectRepository.findOne({
      where: { user_id: userId, project_id: projectId },
    });

    if (existingRelation) {
      // 既存の関連がある場合は役割を更新
      existingRelation.role = role;
      return this.userProjectRepository.save(existingRelation);
    }

    // 新規関連の作成
    const userProject = this.userProjectRepository.create({
      user_id: userId,
      project_id: projectId,
      role: role,
    });

    return this.userProjectRepository.save(userProject);
  }

  /**
   * プロジェクトからメンバーを削除
   */
  async removeProjectMember(
    projectId: number,
    userId: number
  ): Promise<boolean> {
    const result = await this.userProjectRepository.delete({
      user_id: userId,
      project_id: projectId,
    });
    // TypeScript エラーを修正: affected が null の可能性に対応
    return (
      result.affected !== undefined &&
      result.affected !== null &&
      result.affected > 0
    );
  }

  /**
   * プロジェクトメンバーの役割を更新
   */
  async updateMemberRole(
    projectId: number,
    userId: number,
    role: UserProjectRole
  ): Promise<UserProject | null> {
    const userProject = await this.userProjectRepository.findOne({
      where: { user_id: userId, project_id: projectId },
    });

    if (!userProject) {
      return null;
    }

    userProject.role = role;
    return this.userProjectRepository.save(userProject);
  }

  /**
   * プロジェクトのメンバー一覧を取得
   */
  async getProjectMembers(
    projectId: number
  ): Promise<(UserProject & { user: User })[]> {
    return this.userProjectRepository.find({
      where: { project_id: projectId },
      relations: ["user"],
      order: {
        role: "ASC",
        joined_at: "ASC",
      },
    });
  }

  /**
   * 特定のステータスのプロジェクトを取得
   */
  async getProjectsByStatus(status: ProjectStatus): Promise<Project[]> {
    return this.projectRepository.find({
      where: { status },
      order: {
        updated_at: "DESC",
      },
    });
  }

  /**
   * コードからプロジェクトを検索
   */
  async getProjectByCode(code: string): Promise<Project | null> {
    return this.projectRepository.findOne({
      where: { code },
    });
  }

  /**
   * Backlogプロジェクトキーからプロジェクトを検索
   */
  async getProjectByBacklogKey(backlogKey: string): Promise<Project | null> {
    return this.projectRepository.findOne({
      where: { backlog_project_key: backlogKey },
    });
  }
}
