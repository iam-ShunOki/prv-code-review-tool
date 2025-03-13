// backend/src/controllers/AIChatController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { AIAssistantService } from "../services/AIAssistantService";
import { SubmissionService } from "../services/SubmissionService";
import { FeedbackService } from "../services/FeedbackService";
import { ReviewService } from "../services/ReviewService";

export class AIChatController {
  private aiAssistantService: AIAssistantService;
  private submissionService: SubmissionService;
  private feedbackService: FeedbackService;
  private reviewService: ReviewService;

  constructor() {
    this.aiAssistantService = new AIAssistantService();
    this.submissionService = new SubmissionService();
    this.feedbackService = new FeedbackService();
    this.reviewService = new ReviewService();
  }

  /**
   * AIチャットメッセージの処理
   */
  chatMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      // 入力バリデーション
      const chatSchema = z.object({
        reviewId: z.number(),
        message: z.string().min(1, "メッセージは必須です"),
        context: z
          .object({
            reviewTitle: z.string().optional(),
            codeContent: z.string().optional(),
            feedbacks: z
              .array(
                z.object({
                  problem_point: z.string(),
                  suggestion: z.string(),
                  priority: z.string(),
                })
              )
              .optional(),
          })
          .optional(),
      });

      const validatedData = chatSchema.parse(req.body);

      // レビュー情報を取得（リクエストに含まれていない場合）
      let reviewContext = validatedData.context || { reviewTitle: "" };

      if (!reviewContext.reviewTitle) {
        // レビュータイトルを取得
        const review = await this.reviewService.getReviewById(
          validatedData.reviewId
        );
        if (review) {
          reviewContext.reviewTitle = review.title;
        }
      }

      // 最新のコード提出を取得（コードコンテンツがない場合）
      let submissions: any[] = [];
      if (!reviewContext.codeContent) {
        submissions = await this.submissionService.getSubmissionsByReviewId(
          validatedData.reviewId
        );
        if (submissions && submissions.length > 0) {
          // 最新のコード提出を取得
          const latestSubmission = submissions.reduce((latest, current) =>
            current.version > latest.version ? current : latest
          );
          reviewContext.codeContent = latestSubmission.code_content;
        }
      }

      // フィードバックを取得（フィードバックがない場合）
      if (!reviewContext.feedbacks && submissions && submissions.length > 0) {
        const latestSubmission = submissions.reduce((latest, current) =>
          current.version > latest.version ? current : latest
        );
        const feedbacks = await this.feedbackService.getFeedbacksBySubmissionId(
          latestSubmission.id
        );
        reviewContext.feedbacks = feedbacks.map((feedback) => ({
          problem_point: feedback.problem_point,
          suggestion: feedback.suggestion,
          priority: feedback.priority,
        }));
      }

      // AIアシスタントに質問を送信
      const response = await this.aiAssistantService.getResponse(
        validatedData.message,
        validatedData.reviewId,
        reviewContext
      );

      res.status(200).json({
        success: true,
        data: {
          message: response,
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
          message: "AIチャット処理中にエラーが発生しました",
        });
      }
    }
  };
}
