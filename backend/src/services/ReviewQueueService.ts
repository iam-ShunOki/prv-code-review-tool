// backend/src/services/ReviewQueueService.ts
import { AIService } from "./AIService";
import { SubmissionService } from "./SubmissionService";
import { CodeSubmission } from "../models/CodeSubmission";

export class ReviewQueueService {
  private static instance: ReviewQueueService;
  private aiService: AIService;
  private submissionService: SubmissionService;
  private queue: number[] = []; // 処理待ちのsubmission_idを格納
  private isProcessing: boolean = false;

  private constructor() {
    this.aiService = new AIService();
    this.submissionService = new SubmissionService();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): ReviewQueueService {
    if (!ReviewQueueService.instance) {
      ReviewQueueService.instance = new ReviewQueueService();
    }
    return ReviewQueueService.instance;
  }

  /**
   * コード提出をキューに追加
   */
  public async addToQueue(submissionId: number): Promise<void> {
    // 既にキューに存在しなければ追加
    if (!this.queue.includes(submissionId)) {
      this.queue.push(submissionId);
      console.log(`Added submission ${submissionId} to review queue`);

      // キューの処理が実行中でなければ開始
      if (!this.isProcessing) {
        this.processQueue();
      }
    }
  }

  /**
   * キューを順番に処理
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const submissionId = this.queue.shift();

    try {
      console.log(`Processing review for submission ${submissionId}`);

      // 提出データを取得
      const submission = await this.submissionService.getSubmissionById(
        submissionId!
      );

      if (!submission) {
        console.error(`Submission ${submissionId} not found`);
      } else {
        // AIレビューを実行
        await this.aiService.reviewCode(submission);
      }
    } catch (error) {
      console.error(
        `Error processing review for submission ${submissionId}:`,
        error
      );
    } finally {
      // 次のキューアイテムを処理
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * 現在のキュー状態を取得
   */
  public getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
    };
  }
}
