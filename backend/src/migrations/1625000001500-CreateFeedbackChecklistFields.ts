// backend/src/migrations/1625000001500-CreateFeedbackChecklistFields.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFeedbackChecklistFields1625000001500
  implements MigrationInterface
{
  name = "CreateFeedbackChecklistFields1625000001500";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("チェックリスト関連フィールドをfeedbackテーブルに追加します");

    try {
      // フィードバックカテゴリフィールドを追加
      await queryRunner.query(`
        ALTER TABLE feedback
        ADD COLUMN category VARCHAR(50) NULL COMMENT 'フィードバックのカテゴリ'
      `);

      // チェック状態フィールドを追加（is_resolvedは既存のためチェックリスト用フィールドを追加）
      await queryRunner.query(`
        ALTER TABLE feedback
        ADD COLUMN is_checked BOOLEAN NOT NULL DEFAULT false COMMENT 'チェックリストでチェック済みかどうか'
      `);

      // チェック日時フィールドを追加
      await queryRunner.query(`
        ALTER TABLE feedback
        ADD COLUMN checked_at TIMESTAMP NULL COMMENT 'チェックされた日時'
      `);

      // チェック者IDフィールドを追加
      await queryRunner.query(`
        ALTER TABLE feedback
        ADD COLUMN checked_by INT NULL COMMENT 'チェックを行ったユーザーID',
        ADD CONSTRAINT FK_feedback_checked_by FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL
      `);

      // インデックスの作成
      await queryRunner.query(`
        CREATE INDEX idx_feedback_category ON feedback(category)
      `);
      await queryRunner.query(`
        CREATE INDEX idx_feedback_is_checked ON feedback(is_checked)
      `);

      console.log("チェックリスト関連フィールドの追加が完了しました");
    } catch (error) {
      console.error("マイグレーション実行中にエラーが発生しました:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("チェックリスト関連フィールドをfeedbackテーブルから削除します");

    try {
      // 外部キー制約の削除
      await queryRunner.query(`
        ALTER TABLE feedback
        DROP FOREIGN KEY FK_feedback_checked_by
      `);

      // インデックスの削除
      await queryRunner.query(`
        DROP INDEX idx_feedback_category ON feedback
      `);
      await queryRunner.query(`
        DROP INDEX idx_feedback_is_checked ON feedback
      `);

      // フィールドの削除
      await queryRunner.query(`
        ALTER TABLE feedback
        DROP COLUMN category,
        DROP COLUMN is_checked,
        DROP COLUMN checked_at,
        DROP COLUMN checked_by
      `);

      console.log("チェックリスト関連フィールドの削除が完了しました");
    } catch (error) {
      console.error(
        "マイグレーションロールバック中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
