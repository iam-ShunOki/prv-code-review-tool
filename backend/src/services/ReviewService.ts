// backend/src/services/ReviewService.ts
import { AppDataSource } from "../index";
import { Review, ReviewStatus } from "../models/Review";

export class ReviewService {
  private reviewRepository = AppDataSource.getRepository(Review);

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
}
