// backend/src/migrations/1625000002300-AddAIReviewCommentIds.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAIReviewCommentIds1625000002300 implements MigrationInterface {
  name = "AddAIReviewCommentIds1625000002300";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log(
      "github_pull_request_trackersテーブルにai_review_comment_idsカラムを追加します"
    );

    try {
      // ai_review_comment_idsカラムを追加
      await queryRunner.query(`
        ALTER TABLE github_pull_request_trackers
        ADD COLUMN ai_review_comment_ids TEXT NULL COMMENT 'AIが投稿したレビューコメントIDのリスト（JSON形式）'
      `);

      // 既存レコードを更新
      await queryRunner.query(`
        UPDATE github_pull_request_trackers
        SET ai_review_comment_ids = '[]'
        WHERE ai_review_comment_ids IS NULL
      `);

      console.log("ai_review_comment_idsカラムの追加が完了しました");
    } catch (error) {
      console.error("マイグレーション実行中にエラーが発生しました:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      "github_pull_request_trackersテーブルからai_review_comment_idsカラムを削除します"
    );

    try {
      // カラムの削除
      await queryRunner.query(`
        ALTER TABLE github_pull_request_trackers
        DROP COLUMN ai_review_comment_ids
      `);

      console.log("ai_review_comment_idsカラムの削除が完了しました");
    } catch (error) {
      console.error(
        "マイグレーションロールバック中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
