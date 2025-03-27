import { Request, Response } from "express";
import { z } from "zod";
import { FeedbackService } from "../services/FeedbackService";
import { SubmissionService } from "../services/SubmissionService";
import { FeedbackCategory } from "../models/Feedback";
import { ReviewService } from "../services/ReviewService";
import { ReviewStatus } from "../models/Review";

export class FeedbackController {
  private feedbackService: FeedbackService;
  private submissionService: SubmissionService;
  private reviewService: ReviewService;

  constructor() {
    this.feedbackService = new FeedbackService();
    this.submissionService = new SubmissionService();
    this.reviewService = new ReviewService();
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

      // チェックリスト完了率の取得
      const checklistRate = await this.feedbackService.getChecklistRate(
        submissionId
      );

      // カテゴリ別集計を取得
      const categorySummary =
        await this.feedbackService.getFeedbackCategorySummary(submissionId);

      res.status(200).json({
        success: true,
        data: {
          feedbacks,
          resolutionRate,
          checklistRate,
          categorySummary,
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

  /**
   * フィードバックのチェック状態を更新
   */
  updateFeedbackCheckStatus = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // バリデーション
      const updateSchema = z.object({
        is_checked: z.boolean(),
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

      // フィードバックに関連する提出を取得
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

      // チェック状態を更新
      const updatedFeedback =
        await this.feedbackService.updateFeedbackCheckStatus(
          feedbackId,
          validatedData.is_checked,
          userId
        );

      // 更新後のチェックリスト完了率を取得
      const checklistRate = await this.feedbackService.getChecklistRate(
        feedback.submission_id
      );

      // 全てのフィードバックがチェック済みかを確認
      const isAllChecked = await this.feedbackService.isAllFeedbacksChecked(
        feedback.submission_id
      );

      // 全てチェック済みならレビューを完了状態に更新
      if (isAllChecked) {
        await this.reviewService.updateReviewStatus(
          review.id,
          ReviewStatus.COMPLETED
        );
      }

      res.status(200).json({
        success: true,
        message: "フィードバックのチェック状態を更新しました",
        data: {
          feedback: updatedFeedback,
          checklistRate,
          isAllChecked,
          reviewCompleted: isAllChecked,
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

  /**
   * 複数フィードバックのチェック状態を一括更新
   */
  bulkUpdateCheckStatus = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // バリデーション
      const bulkUpdateSchema = z.object({
        feedback_ids: z.array(z.number()),
        is_checked: z.boolean(),
        submission_id: z.number(),
      });

      const validatedData = bulkUpdateSchema.parse(req.body);
      const { feedback_ids, is_checked, submission_id } = validatedData;

      if (feedback_ids.length === 0) {
        res.status(400).json({
          success: false,
          message: "更新するフィードバックが指定されていません",
        });
        return;
      }

      // フィードバックに関連する提出を取得
      const submission = await this.submissionService.getSubmissionById(
        submission_id
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

      // チェック状態を一括更新
      const updateResult = await this.feedbackService.bulkUpdateCheckStatus(
        feedback_ids,
        is_checked,
        userId
      );

      if (!updateResult) {
        res.status(500).json({
          success: false,
          message: "更新中にエラーが発生しました",
        });
        return;
      }

      // 更新後のチェックリスト完了率を取得
      const checklistRate = await this.feedbackService.getChecklistRate(
        submission_id
      );

      // 全てのフィードバックがチェック済みかを確認
      const isAllChecked = await this.feedbackService.isAllFeedbacksChecked(
        submission_id
      );

      // 全てチェック済みならレビューを完了状態に更新
      if (isAllChecked) {
        await this.reviewService.updateReviewStatus(
          review.id,
          ReviewStatus.COMPLETED
        );
      }

      res.status(200).json({
        success: true,
        message: `${feedback_ids.length}件のフィードバックのチェック状態を更新しました`,
        data: {
          updatedCount: feedback_ids.length,
          checklistRate,
          isAllChecked,
          reviewCompleted: isAllChecked,
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

  /**
   * フィードバックのカテゴリを更新
   */
  updateFeedbackCategory = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // バリデーション
      const categorySchema = z.object({
        category: z.nativeEnum(FeedbackCategory),
      });

      const validatedData = categorySchema.parse(req.body);
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

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "認証されていません",
        });
        return;
      }

      // 管理者のみ更新可能（カテゴリはAIまたは管理者が設定するものと想定）
      const isAdmin = req.user?.role === "admin";
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          message: "フィードバックカテゴリの更新権限がありません",
        });
        return;
      }

      // カテゴリを更新
      const updatedFeedback = await this.feedbackService.updateFeedbackCategory(
        feedbackId,
        validatedData.category
      );

      res.status(200).json({
        success: true,
        message: "フィードバックのカテゴリを更新しました",
        data: {
          feedback: updatedFeedback,
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
