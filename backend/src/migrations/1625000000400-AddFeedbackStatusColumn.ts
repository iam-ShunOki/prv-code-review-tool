// backend/src/migrations/1625000000400-AddFeedbackStatusColumn.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackStatusColumn1625000000400
  implements MigrationInterface
{
  name = "AddFeedbackStatusColumn1625000000400";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // フィードバックテーブルに対応状態カラムを追加
    await queryRunner.query(`
      ALTER TABLE feedback
      ADD COLUMN is_resolved BOOLEAN NOT NULL DEFAULT false
    `);

    // インデックスの作成
    await queryRunner.query(
      `CREATE INDEX idx_feedback_is_resolved ON feedback(is_resolved)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // インデックスの削除
    await queryRunner.query(`DROP INDEX idx_feedback_is_resolved ON feedback`);

    // カラムの削除
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN is_resolved`);
  }
}
