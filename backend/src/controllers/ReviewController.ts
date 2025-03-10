// backend/src/controllers/ReviewController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { ReviewService } from "../services/ReviewService";

export class ReviewController {
  private reviewService: ReviewService;

  constructor() {
    this.reviewService = new ReviewService();
  }

  /**
   * 新規レビュー作成
   */
  createReview = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const reviewSchema = z.object({
        title: z.string().min(3, "タイトルは3文字以上必要です"),
        description: z.string().optional(),
      });

      const validatedData = reviewSchema.parse(req.body);

      // ユーザーIDを取得（認証ミドルウェアで設定）
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // レビュー作成
      const review = await this.reviewService.createReview({
        user_id: userId,
        title: validatedData.title,
        description: validatedData.description || "",
      });

      res.status(201).json({
        success: true,
        message: "レビューが作成されました",
        data: review,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "予期せぬエラーが発生しました",
        });
      }
    }
  };

  /**
   * レビュー一覧取得
   */
  getReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const isAdmin = req.user?.role === "admin";

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 管理者の場合は全てのレビュー、そうでない場合は自分のレビューのみ取得
      const reviews = isAdmin
        ? await this.reviewService.getAllReviews()
        : await this.reviewService.getUserReviews(userId);

      res.status(200).json({
        success: true,
        data: reviews,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "レビュー取得中にエラーが発生しました",
      });
    }
  };

  /**
   * 特定のレビュー取得
   */
  getReviewById = async (req: Request, res: Response): Promise<void> => {
    try {
      const reviewId = parseInt(req.params.id);
      const userId = req.user?.id;
      const isAdmin = req.user?.role === "admin";

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // レビュー取得
      const review = await this.reviewService.getReviewById(reviewId);

      if (!review) {
        res.status(404).json({
          success: false,
          message: "レビューが見つかりません",
        });
        return;
      }

      // 管理者でなく、かつ自分のレビューでない場合はアクセス拒否
      if (!isAdmin && review.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: "このレビューにアクセスする権限がありません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: review,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "レビュー取得中にエラーが発生しました",
      });
    }
  };
}