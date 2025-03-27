// backend/src/migrations/1625000001900-AddProcessedCommentIds.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessedCommentIds1625000001900 implements MigrationInterface {
  name = "AddProcessedCommentIds1625000001900";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log(
      "処理済みコメントID追跡フィールドをpull_request_trackersテーブルに追加します"
    );

    try {
      // processed_comment_idsカラムを追加
      await queryRunner.query(`
        ALTER TABLE pull_request_trackers
        ADD COLUMN processed_comment_ids TEXT NULL COMMENT '処理済みコメントIDのリスト（JSON形式）'
      `);

      // 既存レコードを更新
      await queryRunner.query(`
        UPDATE pull_request_trackers
        SET processed_comment_ids = '[]'
        WHERE processed_comment_ids IS NULL
      `);

      console.log("processed_comment_idsカラムの追加が完了しました");
    } catch (error) {
      console.error("マイグレーション実行中にエラーが発生しました:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      "processed_comment_idsカラムをpull_request_trackersテーブルから削除します"
    );

    try {
      // カラムの削除
      await queryRunner.query(`
        ALTER TABLE pull_request_trackers
        DROP COLUMN processed_comment_ids
      `);

      console.log("processed_comment_idsカラムの削除が完了しました");
    } catch (error) {
      console.error(
        "マイグレーションロールバック中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
