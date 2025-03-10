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
  }): Promise<Review> {
    const review = this.reviewRepository.create({
      user_id: reviewData.user_id,
      title: reviewData.title,
      description: reviewData.description,
      status: ReviewStatus.PENDING,
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
    });
  }

  /**
   * 全てのレビュー一覧を取得（管理者用）
   */
  async getAllReviews(): Promise<Review[]> {
    return this.reviewRepository.find({
      order: { created_at: "DESC" },
      relations: ["user"],
    });
  }

  /**
   * 特定のレビューを取得
   */
  async getReviewById(id: number): Promise<Review | null> {
    return this.reviewRepository.findOne({
      where: { id },
      relations: ["submissions"],
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
}