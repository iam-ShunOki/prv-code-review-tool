// backend/src/migrations/1625000002000-AddDescriptionProcessedToPullRequestTrackers.ts

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDescriptionProcessedToPullRequestTrackers1625000002000
  implements MigrationInterface
{
  name = "AddDescriptionProcessedToPullRequestTrackers1625000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log(
      "pull_request_trackersテーブルにdescription_processedカラムを追加します"
    );

    try {
      // description_processedカラムを追加
      await queryRunner.query(`
        ALTER TABLE pull_request_trackers
        ADD COLUMN description_processed BOOLEAN NOT NULL DEFAULT false
        COMMENT 'PR説明文の@codereviewが処理済みかどうか'
      `);

      console.log("description_processedカラムの追加が完了しました");
    } catch (error) {
      console.error("マイグレーション実行中にエラーが発生しました:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      "pull_request_trackersテーブルからdescription_processedカラムを削除します"
    );

    try {
      // カラムの削除
      await queryRunner.query(`
        ALTER TABLE pull_request_trackers
        DROP COLUMN description_processed
      `);

      console.log("description_processedカラムの削除が完了しました");
    } catch (error) {
      console.error(
        "マイグレーションロールバック中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
