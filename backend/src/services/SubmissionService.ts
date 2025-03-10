// backend/src/services/SubmissionService.ts
import { AppDataSource } from "../index";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";

export class SubmissionService {
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);

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
   * コード提出のステータスを更新
   */
  async updateSubmissionStatus(
    id: number,
    status: SubmissionStatus
  ): Promise<CodeSubmission | null> {
    await this.submissionRepository.update(id, { status });
    return this.getSubmissionById(id);
  }
}
