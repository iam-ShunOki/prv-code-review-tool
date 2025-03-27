// backend/src/migrations/1625000001800-EnhancePullRequestTracker.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class EnhancePullRequestTracker1625000001800
  implements MigrationInterface
{
  name = "EnhancePullRequestTracker1625000001800";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("PullRequestTrackerテーブルを拡張します");

    try {
      // review_historyカラムを追加
      await queryRunner.query(`
        ALTER TABLE pull_request_trackers
        ADD COLUMN review_count INT NOT NULL DEFAULT 1 COMMENT 'レビュー実施回数',
        ADD COLUMN last_review_at TIMESTAMP NULL COMMENT '最後にレビューした日時',
        ADD COLUMN review_history TEXT NULL COMMENT '過去のレビュー履歴（JSON形式）'
      `);

      console.log("PullRequestTrackerテーブルの拡張が完了しました");
    } catch (error) {
      console.error("マイグレーション実行中にエラーが発生しました:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("PullRequestTrackerテーブルの拡張を元に戻します");

    try {
      // 追加したカラムを削除
      await queryRunner.query(`
        ALTER TABLE pull_request_trackers
        DROP COLUMN review_count,
        DROP COLUMN last_review_at,
        DROP COLUMN review_history
      `);

      console.log("PullRequestTrackerテーブルの拡張を元に戻しました");
    } catch (error) {
      console.error(
        "マイグレーションロールバック中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
