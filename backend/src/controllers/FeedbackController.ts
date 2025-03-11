// backend/src/controllers/FeedbackController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { FeedbackService } from "../services/FeedbackService";
import { SubmissionService } from "../services/SubmissionService";

export class FeedbackController {
  private feedbackService: FeedbackService;
  private submissionService: SubmissionService;

  constructor() {
    this.feedbackService = new FeedbackService();
    this.submissionService = new SubmissionService();
  }

  /**
   * 特定のコード提出に対するフィードバック一覧を取得
   */
  getFeedbacksBySubmissionId = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const submissionId = parseInt(req.params.submissionId);

      // フィードバック一覧を取得
      const feedbacks = await this.feedbackService.getFeedbacksBySubmissionId(
        submissionId
      );

      // 解決率の取得
      const resolutionRate = await this.feedbackService.getResolutionRate(
        submissionId
      );

      res.status(200).json({
        success: true,
        data: {
          feedbacks,
          resolutionRate,
        },
      });
    } catch (error) {
      console.error("フィードバック一覧取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "フィードバック一覧の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * フィードバックの対応状態を更新
   */
  updateFeedbackStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      // バリデーション
      const updateSchema = z.object({
        is_resolved: z.boolean(),
      });

      const validatedData = updateSchema.parse(req.body);
      const feedbackId = parseInt(req.params.id);

      // まず、フィードバックが存在するか確認する
      const feedback = await this.feedbackService.getFeedbackById(feedbackId);
      if (!feedback) {
        res.status(404).json({
          success: false,
          message: "フィードバックが見つかりません",
        });
        return;
      }

      // フィードバックに関連する提出が、リクエストしたユーザーのものか確認
      const submission = await this.submissionService.getSubmissionById(
        feedback.submission_id
      );
      if (!submission) {
        res.status(404).json({
          success: false,
          message: "提出が見つかりません",
        });
        return;
      }

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 権限チェック（管理者または提出者自身のみ更新可能）
      const review = await this.submissionService.getReviewBySubmissionId(
        submission.id
      );
      if (!review) {
        res.status(404).json({
          success: false,
          message: "レビューが見つかりません",
        });
        return;
      }

      const isAdmin = req.user?.role === "admin";
      if (!isAdmin && review.user_id !== userId) {
        res.status(403).json({
          success: false,
          message: "フィードバックの更新権限がありません",
        });
        return;
      }

      // 対応状態を更新
      const updatedFeedback = await this.feedbackService.updateFeedbackStatus(
        feedbackId,
        validatedData.is_resolved
      );

      // 更新後の解決率を取得
      const resolutionRate = await this.feedbackService.getResolutionRate(
        feedback.submission_id
      );

      res.status(200).json({
        success: true,
        message: "フィードバックの対応状態を更新しました",
        data: {
          feedback: updatedFeedback,
          resolutionRate,
        },
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
          message: "フィードバックの更新中にエラーが発生しました",
        });
      }
    }
  };
}
