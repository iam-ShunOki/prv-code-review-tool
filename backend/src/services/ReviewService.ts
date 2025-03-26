// backend/src/services/ReviewService.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";
import { UserProject } from "../models/UserProject";

export class ReviewService {
  private reviewRepository = AppDataSource.getRepository(Review);
  private userProjectRepository = AppDataSource.getRepository(UserProject);

  /**
   * 新規レビュー作成
   */
  async createReview(reviewData: {
    user_id: number;
    title: string;
    description: string;
    project_id?: number;
  }): Promise<Review> {
    const review = this.reviewRepository.create({
      user_id: reviewData.user_id,
      title: reviewData.title,
      description: reviewData.description,
      status: ReviewStatus.PENDING,
      project_id: reviewData.project_id,
    });

    return this.reviewRepository.save(review);
  }

  /**
   * ユーザーのレビュー一覧を取得
   */
  async getUserReviews(userId: number): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      relations: ["project"],
    });
  }

  /**
   * 全てのレビュー一覧を取得（管理者用）
   */
  async getAllReviews(): Promise<Review[]> {
    return this.reviewRepository.find({
      order: { created_at: "DESC" },
      relations: ["user", "project"],
    });
  }

  /**
   * 特定のレビューを取得
   */
  async getReviewById(id: number): Promise<Review | null> {
    return this.reviewRepository.findOne({
      where: { id },
      relations: ["submissions", "project"],
    });
  }

  /**
   * レビューのステータスを更新
   */
  async updateReviewStatus(
    id: number,
    status: ReviewStatus
  ): Promise<Review | null> {
    await this.reviewRepository.update(id, { status });
    return this.getReviewById(id);
  }

  /**
   * 特定のプロジェクトに関連するレビュー一覧を取得
   */
  async getProjectReviews(projectId: number): Promise<Review[]> {
    return this.reviewRepository.find({
      where: { project_id: projectId },
      order: { created_at: "DESC" },
      relations: ["user"],
    });
  }

  /**
   * レビューの情報を更新（プロジェクト関連を含む）
   */
  async updateReview(
    id: number,
    reviewData: Partial<{
      title: string;
      description: string;
      status: ReviewStatus;
      project_id: number | null;
    }>
  ): Promise<Review | null> {
    await this.reviewRepository.update(id, {
      ...reviewData,
      project_id:
        reviewData.project_id === null ? undefined : reviewData.project_id,
    });
    return this.getReviewById(id);
  }

  /**
   * ユーザーがアクセス可能なレビュー一覧を取得する
   * - 自分のレビュー
   * - 自分が所属するプロジェクトのレビュー
   */
  async getUserAccessibleReviews(userId: number): Promise<any[]> {
    // 1. 自分が所属するプロジェクトのIDを取得
    const userProjects = await this.userProjectRepository
      .createQueryBuilder("up")
      .select("up.project_id")
      .where("up.user_id = :userId", { userId })
      .getMany();

    const projectIds = userProjects.map(
      (up: { project_id: any }) => up.project_id
    );

    // 2. 条件作成: 自分のレビュー OR 自分が所属するプロジェクトのレビュー
    const queryBuilder = this.reviewRepository
      .createQueryBuilder("review")
      .leftJoinAndSelect("review.user", "user")
      .where("review.user_id = :userId", { userId });

    // プロジェクトに所属している場合、そのプロジェクトのレビューも取得
    if (projectIds.length > 0) {
      queryBuilder.orWhere("review.project_id IN (:...projectIds)", {
        projectIds,
      });
    }

    // 3. 取得して返す
    const reviews = await queryBuilder
      .orderBy("review.created_at", "DESC")
      .getMany();

    return reviews;
  }

  /**
   * ユーザーが指定したプロジェクトのメンバーかどうかを確認
   */
  async isUserProjectMember(
    projectId: number,
    userId: number
  ): Promise<boolean> {
    const userProject = await this.userProjectRepository
      .createQueryBuilder("up")
      .where("up.project_id = :projectId", { projectId })
      .andWhere("up.user_id = :userId", { userId })
      .getOne();

    return !!userProject;
  }
}
