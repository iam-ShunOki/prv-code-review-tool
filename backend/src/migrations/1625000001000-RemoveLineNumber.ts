// backend/src/migrations/1625000001000-RemoveLineNumber.ts
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * line_numberフィールドを完全に削除するマイグレーション
 *
 * 注意: 既存のデータがある場合、このマイグレーションを実行すると
 * feedback.line_numberフィールドの値が永久に失われます。
 * 必要に応じてバックアップを取ってから実行してください。
 */
export class RemoveLineNumber1625000001000 implements MigrationInterface {
  name = "RemoveLineNumber1625000001000";

  /**
   * マイグレーション実行処理
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // line_numberカラムを削除
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN line_number`);

    console.log("Successfully removed line_number column from feedback table");
  }

  /**
   * マイグレーションロールバック処理
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // ロールバック時には line_number カラムを再作成（nullable で作成）
    await queryRunner.query(
      `ALTER TABLE feedback ADD COLUMN line_number INT NULL`
    );

    console.log("Successfully restored line_number column to feedback table");
  }
}
