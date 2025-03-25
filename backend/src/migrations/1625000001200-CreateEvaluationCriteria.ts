// backend/src/migrations/1625000001200-CreateEvaluationCriteria.ts
import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateEvaluationCriteria1625000001200
  implements MigrationInterface
{
  name = "CreateEvaluationCriteria1625000001200";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 評価基準テーブルの作成
    try {
      await queryRunner.createTable(
        new Table({
          name: "evaluation_criteria",
          columns: [
            {
              name: "id",
              type: "int",
              isPrimary: true,
              isGenerated: true,
              generationStrategy: "increment",
            },
            {
              name: "`key`", // バッククォートでエスケープ
              type: "varchar",
              length: "50",
              isUnique: true,
            },
            {
              name: "name",
              type: "varchar",
              length: "100",
            },
            {
              name: "description",
              type: "text",
              isNullable: true,
            },
            {
              name: "min_score",
              type: "int",
              default: 0,
            },
            {
              name: "max_score",
              type: "int",
              default: 10,
            },
            {
              name: "weight",
              type: "float",
              default: 1.0,
            },
            {
              name: "is_active",
              type: "boolean",
              default: true,
            },
            {
              name: "display_order",
              type: "int",
              default: 0,
            },
            {
              name: "created_at",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updated_at",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
              onUpdate: "CURRENT_TIMESTAMP",
            },
          ],
          indices: [
            {
              name: "idx_evaluation_criteria_key",
              columnNames: ["`key`"], // バッククォートでエスケープ
              isUnique: true,
            },
          ],
        }),
        true
      );

      // 初期データの挿入
      await queryRunner.query(`
        INSERT INTO evaluation_criteria (\`key\`, name, description, min_score, max_score, weight, is_active, display_order)
        VALUES 
          ('code_quality', 'コード品質', 'コードの品質、堅牢性、エラー処理など', 0, 10, 1.0, true, 1),
          ('readability', '可読性', 'コードの読みやすさ、命名規則、コメントなど', 0, 10, 1.0, true, 2),
          ('efficiency', '効率性', 'アルゴリズムの選択、メモリと時間の効率など', 0, 10, 1.0, true, 3),
          ('best_practices', 'ベストプラクティス', '業界標準のプラクティスの採用と適用', 0, 10, 1.0, true, 4)
      `);

      console.log(
        "Successfully created evaluation_criteria table and inserted initial data"
      );
    } catch (error) {
      console.error("Error creating evaluation_criteria table:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      // テーブルを削除
      await queryRunner.dropTable("evaluation_criteria");
      console.log("Successfully dropped evaluation_criteria table");
    } catch (error) {
      console.error("Error dropping evaluation_criteria table:", error);
      throw error;
    }
  }
}
