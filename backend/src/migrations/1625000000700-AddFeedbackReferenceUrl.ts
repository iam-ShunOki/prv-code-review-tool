// backend/src/migrations/1625000000700-AddFeedbackReferenceUrl.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackReferenceUrl1625000000700
  implements MigrationInterface
{
  name = "AddFeedbackReferenceUrl1625000000700";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // feedbackテーブルにreference_urlカラムを追加
    await queryRunner.query(`
      ALTER TABLE feedback
      ADD COLUMN reference_url TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // マイグレーションを戻す場合はカラムを削除
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN reference_url`);
  }
}
