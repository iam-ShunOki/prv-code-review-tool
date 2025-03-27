// backend/src/migrations/1625000001600-CreateYearlyCriteriaSettings.ts
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateYearlyCriteriaSettings1625000001600
  implements MigrationInterface
{
  name = "CreateYearlyCriteriaSettings1625000001600";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("年度別評価基準設定テーブルを作成します");

    try {
      // 年度別評価基準設定テーブルの作成
      await queryRunner.createTable(
        new Table({
          name: "yearly_criteria_settings",
          columns: [
            {
              name: "id",
              type: "int",
              isPrimary: true,
              isGenerated: true,
              generationStrategy: "increment",
            },
            {
              name: "criteria_id",
              type: "int",
              isNullable: false,
              comment: "評価基準ID",
            },
            {
              name: "academic_year",
              type: "int",
              isNullable: false,
              comment: "対象年度",
            },
            {
              name: "weight",
              type: "float",
              default: 1.0,
              comment: "この年度での評価の重み",
            },
            {
              name: "is_active",
              type: "boolean",
              default: true,
              comment: "この年度でこの基準を使用するかどうか",
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
              name: "idx_criteria_year",
              columnNames: ["criteria_id", "academic_year"],
              isUnique: true,
            },
            {
              name: "idx_academic_year",
              columnNames: ["academic_year"],
            },
          ],
        }),
        true
      );

      // 外部キー制約の追加
      await queryRunner.createForeignKey(
        "yearly_criteria_settings",
        new TableForeignKey({
          columnNames: ["criteria_id"],
          referencedTableName: "evaluation_criteria",
          referencedColumnNames: ["id"],
          onDelete: "CASCADE",
        })
      );

      // 年度構成テーブルの作成
      await queryRunner.createTable(
        new Table({
          name: "academic_year_settings",
          columns: [
            {
              name: "id",
              type: "int",
              isPrimary: true,
              isGenerated: true,
              generationStrategy: "increment",
            },
            {
              name: "academic_year",
              type: "int",
              isNullable: false,
              isUnique: true,
              comment: "年度（例: 2025）",
            },
            {
              name: "name",
              type: "varchar",
              length: "100",
              isNullable: false,
              comment: "年度の表示名（例: 2025年度）",
            },
            {
              name: "description",
              type: "text",
              isNullable: true,
              comment: "年度の説明",
            },
            {
              name: "is_current",
              type: "boolean",
              default: false,
              comment: "現在の年度かどうか",
            },
            {
              name: "is_active",
              type: "boolean",
              default: true,
              comment: "有効な年度かどうか",
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
        }),
        true
      );

      // 初期データの挿入 - デフォルトの年度を設定
      const currentYear = new Date().getFullYear();
      await queryRunner.query(`
        INSERT INTO academic_year_settings (academic_year, name, is_current, is_active)
        VALUES 
          (${currentYear}, '${currentYear}年度', true, true),
          (${currentYear - 1}, '${currentYear - 1}年度', false, true)
      `);

      // 現在有効な全ての評価基準に対する年度別設定の作成
      const activeCriteria = await queryRunner.query(`
        SELECT id FROM evaluation_criteria WHERE is_active = true
      `);

      if (activeCriteria && activeCriteria.length > 0) {
        // 挿入するデータを構築
        const values = activeCriteria
          .map((criteria: { id: number }) => {
            return `(${criteria.id}, ${currentYear}, 1.0, true), (${
              criteria.id
            }, ${currentYear - 1}, 1.0, true)`;
          })
          .join(", ");

        if (values) {
          await queryRunner.query(`
            INSERT INTO yearly_criteria_settings 
              (criteria_id, academic_year, weight, is_active)
            VALUES ${values}
          `);
        }
      }

      console.log("年度別評価基準設定テーブルの作成が完了しました");
    } catch (error) {
      console.error(
        "年度別評価基準設定テーブルの作成中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("年度別評価基準設定テーブルを削除します");

    try {
      // テーブル削除（作成の逆順）
      await queryRunner.dropTable("yearly_criteria_settings");
      await queryRunner.dropTable("academic_year_settings");

      console.log("年度別評価基準設定テーブルの削除が完了しました");
    } catch (error) {
      console.error(
        "年度別評価基準設定テーブルの削除中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
