// backend/src/migrations/1625000001100-AddCodeSnippetToFeedback.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCodeSnippetToFeedback1625000001100
  implements MigrationInterface
{
  name = "AddCodeSnippetToFeedback1625000001100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // code_snippetカラムを追加
    await queryRunner.query(
      `ALTER TABLE feedback ADD COLUMN code_snippet TEXT NULL`
    );

    console.log("Successfully added code_snippet column to feedback table");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ロールバック時にはcode_snippetカラムを削除
    await queryRunner.query(`ALTER TABLE feedback DROP COLUMN code_snippet`);

    console.log("Successfully removed code_snippet column from feedback table");
  }
}
