// backend/src/services/SubmissionService.ts
import { AppDataSource } from "../index";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { Review } from "../models/Review";

export class SubmissionService {
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private reviewRepository = AppDataSource.getRepository(Review);

  /**
   * 新規コード提出作成
   */
  async createSubmission(submissionData: {
    review_id: number;
    code_content: string;
    expectation?: string;
  }): Promise<CodeSubmission> {
    // 最新バージョン番号を取得
    const latestSubmission = await this.submissionRepository.findOne({
      where: { review_id: submissionData.review_id },
      order: { version: "DESC" },
    });

    const version = latestSubmission ? latestSubmission.version + 1 : 1;

    // エンティティを作成
    const submission = new CodeSubmission();
    submission.review_id = submissionData.review_id;
    submission.code_content = submissionData.code_content;
    submission.expectation = submissionData.expectation || "";
    submission.status = SubmissionStatus.SUBMITTED;
    submission.version = version;

    // 保存して結果を返す
    return this.submissionRepository.save(submission);
  }

  /**
   * 特定のレビューのコード提出一覧を取得
   */
  async getSubmissionsByReviewId(reviewId: number): Promise<CodeSubmission[]> {
    return this.submissionRepository.find({
      where: { review_id: reviewId },
      order: { version: "DESC" },
      relations: ["feedbacks", "evaluations"],
    });
  }

  /**
   * 特定のコード提出を取得
   */
  async getSubmissionById(id: number): Promise<CodeSubmission | null> {
    return this.submissionRepository.findOne({
      where: { id },
      relations: ["feedbacks", "evaluations"],
    });
  }

  /**
   * コード提出に関連するレビューを取得
   */
  async getReviewBySubmissionId(submissionId: number): Promise<Review | null> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
    });

    if (!submission) {
      return null;
    }

    return this.reviewRepository.findOne({
      where: { id: submission.review_id },
    });
  }

  /**
   * コード提出のステータスを更新
   */
  async updateSubmissionStatus(
    id: number,
    status: SubmissionStatus
  ): Promise<CodeSubmission | null> {
    await this.submissionRepository.update(id, { status });
    return this.getSubmissionById(id);
  }

  /**
   * レビューIDに紐づく最新のコード提出を取得
   */
  async getLatestSubmissionByReviewId(
    reviewId: number
  ): Promise<CodeSubmission | null> {
    console.log(`レビューID ${reviewId} に紐づく最新のコード提出を取得します`);

    try {
      const submissions = await this.submissionRepository.find({
        where: { review_id: reviewId },
        order: { version: "DESC" },
        take: 1,
      });

      if (submissions && submissions.length > 0) {
        console.log(
          `レビューID ${reviewId} の最新コード提出 #${submissions[0].id} (バージョン ${submissions[0].version}) を取得しました`
        );
        return submissions[0];
      } else {
        console.log(
          `レビューID ${reviewId} に紐づくコード提出が見つかりませんでした`
        );
        return null;
      }
    } catch (error) {
      console.error(`レビューID ${reviewId} のコード提出取得エラー:`, error);
      throw new Error(
        `コード提出の取得に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
