// backend/src/services/ReviewQueueService.ts
import { AIService } from "./AIService";
import { SubmissionService } from "./SubmissionService";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { AppDataSource } from "../index";

interface QueueItem {
  submissionId: number;
  retryCount: number;
  addedAt: Date;
}

export class ReviewQueueService {
  private static instance: ReviewQueueService;
  private aiService: AIService;
  private submissionService: SubmissionService;
  private queue: QueueItem[] = []; // 処理待ちの項目
  private processingItems: Set<number> = new Set(); // 現在処理中の提出ID
  private isProcessing: boolean = false;
  private maxRetries: number = 3; // 最大リトライ回数
  private retryDelayMs: number = 5000; // リトライ間隔 (5秒)

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
    // データベースで提出が存在するか確認
    try {
      const submission = await this.submissionService.getSubmissionById(
        submissionId
      );

      if (!submission) {
        console.error(
          `Cannot add submission ${submissionId} to queue: Not found in database`
        );
        return;
      }

      // 既に処理中かチェック
      if (this.processingItems.has(submissionId)) {
        console.log(
          `Submission ${submissionId} is currently being processed, not adding to queue again`
        );
        return;
      }

      // 既にキューにあるかチェック
      const existingItem = this.queue.find(
        (item) => item.submissionId === submissionId
      );
      if (existingItem) {
        console.log(
          `Submission ${submissionId} is already in queue (added at ${existingItem.addedAt.toISOString()})`
        );
        return;
      }

      // キューに追加
      this.queue.push({
        submissionId,
        retryCount: 0,
        addedAt: new Date(),
      });
      console.log(`Added submission ${submissionId} to review queue`);

      // 処理を開始（実行中でなければ）
      this.startProcessing();
    } catch (error) {
      console.error(
        `Error verifying submission ${submissionId} before adding to queue:`,
        error
      );
    }
  }

  /**
   * キュー処理を開始
   */
  private startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processQueue().catch((error) => {
      console.error("Error in queue processing:", error);
      this.isProcessing = false;
    });
  }

  /**
   * キューを順番に処理
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      console.log("Queue is empty, stopping processing");
      this.isProcessing = false;
      return;
    }

    // 次の項目を取得（キューからは削除しない）
    const queueItem = this.queue[0];
    const { submissionId, retryCount } = queueItem;

    // 処理中リストに追加
    this.processingItems.add(submissionId);

    try {
      console.log(
        `Processing review for submission ${submissionId} (attempt ${
          retryCount + 1
        }/${this.maxRetries + 1})`
      );

      // 提出データを取得
      const submission = await this.submissionService.getSubmissionById(
        submissionId
      );

      if (!submission) {
        console.error(`Submission ${submissionId} not found in database`);

        // リトライ回数をチェック
        if (retryCount >= this.maxRetries) {
          console.log(
            `Maximum retry count reached for submission ${submissionId}, removing from queue`
          );
          this.queue.shift(); // キューから削除
        } else {
          // リトライカウントを増やして待機リストの最後に移動
          queueItem.retryCount++;
          this.queue.shift();
          this.queue.push(queueItem);
          console.log(
            `Will retry submission ${submissionId} later (retry ${queueItem.retryCount}/${this.maxRetries})`
          );
        }
      } else {
        // 提出が見つかった場合
        if (submission.status === SubmissionStatus.REVIEWED) {
          console.log(
            `Submission ${submissionId} is already reviewed, skipping`
          );
          this.queue.shift(); // キューから削除
        } else {
          // AIレビューを実行
          await this.aiService.reviewCode(submission);
          console.log(`Review completed for submission ${submissionId}`);
          this.queue.shift(); // キューから削除
        }
      }
    } catch (error) {
      console.error(
        `Error processing review for submission ${submissionId}:`,
        error
      );

      // エラーが発生した場合もリトライ回数をチェック
      if (retryCount >= this.maxRetries) {
        console.log(
          `Maximum retry count reached for submission ${submissionId} after error, removing from queue`
        );
        this.queue.shift(); // キューから削除
      } else {
        // リトライカウントを増やして待機リストの最後に移動
        queueItem.retryCount++;
        this.queue.shift();
        this.queue.push(queueItem);
        console.log(
          `Will retry submission ${submissionId} later after error (retry ${queueItem.retryCount}/${this.maxRetries})`
        );
      }
    } finally {
      // 処理中リストから削除
      this.processingItems.delete(submissionId);

      // 一度待機してから次の処理
      setTimeout(
        () => {
          this.processQueue().catch((error) => {
            console.error("Error in queue processing:", error);
            this.isProcessing = false;
          });
        },
        retryCount > 0 ? this.retryDelayMs : 1000
      ); // リトライの場合は長めに待機
    }
  }

  /**
   * 現在のキュー状態を取得
   */
  public getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    processingItems: number[];
    queueItems: { id: number; retries: number }[];
  } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      processingItems: Array.from(this.processingItems),
      queueItems: this.queue.map((item) => ({
        id: item.submissionId,
        retries: item.retryCount,
      })),
    };
  }
}
