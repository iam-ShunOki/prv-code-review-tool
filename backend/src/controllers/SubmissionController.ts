// backend/src/controllers/SubmissionController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { SubmissionService } from "../services/SubmissionService";
import { ReviewService } from "../services/ReviewService";
import { ReviewStatus } from "../models/Review";
import { ReviewQueueService } from "../services/ReviewQueueService";

export class SubmissionController {
  private submissionService: SubmissionService;
  private reviewService: ReviewService;

  constructor() {
    this.submissionService = new SubmissionService();
    this.reviewService = new ReviewService();
  }

  /**
   * 新規コード提出
   */
  createSubmission = async (req: Request, res: Response): Promise<void> => {
    try {
      // ======== 追加: 管理者権限チェック ========
      const isAdmin = req.user?.role === "admin";
      if (!isAdmin) {
        console.log(
          `アクセス拒否: 管理者以外のユーザー(ID: ${req.user?.id})がコード提出を試みました`
        );
        res.status(403).json({
          success: false,
          message: "現在、コード提出機能は管理者のみ利用可能です",
        });
        return;
      }
      // ====================================

      // 入力バリデーション
      const submissionSchema = z.object({
        review_id: z.number(),
        code_content: z.string().min(1, "コードは必須です"),
        expectation: z.string().optional(),
      });

      const validatedData = submissionSchema.parse(req.body);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // レビューが存在するか、自分のレビューかチェック
      const review = await this.reviewService.getReviewById(
        validatedData.review_id
      );

      if (!review) {
        res.status(404).json({
          success: false,
          message: "レビューが見つかりません",
        });
        return;
      }

      if (review.user_id !== userId && !isAdmin) {
        res.status(403).json({
          success: false,
          message: "このレビューにコードを提出する権限がありません",
        });
        return;
      }

      // コード提出作成
      console.log(
        `コード提出を作成します: レビューID ${validatedData.review_id}`
      );
      const submission = await this.submissionService.createSubmission({
        review_id: validatedData.review_id,
        code_content: validatedData.code_content,
        expectation: validatedData.expectation || "",
      });

      // レビューのステータスを更新
      console.log(
        `レビューステータスを更新します: レビューID ${validatedData.review_id}`
      );
      await this.reviewService.updateReviewStatus(
        validatedData.review_id,
        ReviewStatus.IN_PROGRESS
      );

      // AIレビューキューに追加
      console.log(`AIレビューキューに追加します: 提出ID ${submission.id}`);
      await ReviewQueueService.getInstance().addToQueue(submission.id);

      res.status(201).json({
        success: true,
        message: "コードが提出されました",
        data: submission,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`バリデーションエラー: ${JSON.stringify(error.errors)}`);
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else if (error instanceof Error) {
        console.error(`コード提出エラー: ${error.message}`);
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        console.error(`予期せぬエラーが発生しました: ${error}`);
        res.status(500).json({
          success: false,
          message: "予期せぬエラーが発生しました",
        });
      }
    }
  };

  /**
   * 特定のレビューのコード提出一覧を取得
   */
  getSubmissionsByReviewId = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const reviewId = parseInt(req.params.reviewId);
      const userId = req.user?.id;
      const isAdmin = req.user?.role === "admin";

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // レビューが存在するか、自分のレビューかチェック
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
        console.log(
          `アクセス拒否: ユーザー(ID: ${userId})がレビュー(ID: ${reviewId})の提出一覧を取得しようとしました`
        );
        res.status(403).json({
          success: false,
          message: "このレビューの提出一覧を取得する権限がありません",
        });
        return;
      }

      // コード提出一覧取得
      console.log(`コード提出一覧を取得します: レビューID ${reviewId}`);
      const submissions = await this.submissionService.getSubmissionsByReviewId(
        reviewId
      );

      res.status(200).json({
        success: true,
        data: submissions,
      });
    } catch (error) {
      console.error(`コード提出一覧取得エラー: ${error}`);
      res.status(500).json({
        success: false,
        message: "コード提出一覧取得中にエラーが発生しました",
      });
    }
  };
}
