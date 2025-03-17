// backend/src/migrations/1625000000800-AddUsageLimitsAndLogs.ts
import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddUsageLimitsAndLogs1625000000800 implements MigrationInterface {
  name = "AddUsageLimitsAndLogs1625000000800";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 利用制限設定テーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "usage_limits",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "feature_key",
            type: "varchar",
            length: "50",
            isNullable: false,
            comment: "機能を識別するキー (例: 'code_review', 'ai_chat')",
          },
          {
            name: "daily_limit",
            type: "int",
            isNullable: false,
            default: 10,
            comment: "1日あたりの利用制限回数",
          },
          {
            name: "description",
            type: "varchar",
            length: "255",
            isNullable: true,
            comment: "機能の説明",
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
            comment: "この制限が有効かどうか",
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
            name: "idx_feature_key",
            columnNames: ["feature_key"],
            isUnique: true,
          },
        ],
      }),
      true
    );

    // 利用履歴テーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "usage_logs",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "user_id",
            type: "int",
            isNullable: false,
            comment: "利用したユーザーのID",
          },
          {
            name: "feature_key",
            type: "varchar",
            length: "50",
            isNullable: false,
            comment: "利用した機能のキー",
          },
          {
            name: "used_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            comment: "利用日時",
          },
          {
            name: "request_id",
            type: "varchar",
            length: "100",
            isNullable: true,
            comment: "関連するリクエストのID（例：レビューID）",
          },
          {
            name: "metadata",
            type: "text",
            isNullable: true,
            comment: "追加メタデータ（JSON形式で保存）",
          },
        ],
        indices: [
          {
            name: "idx_usage_logs_user_feature",
            columnNames: ["user_id", "feature_key"],
          },
          {
            name: "idx_usage_logs_used_at",
            columnNames: ["used_at"],
          },
        ],
        foreignKeys: [
          {
            columnNames: ["user_id"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true
    );

    // 初期設定データの挿入
    await queryRunner.query(`
      INSERT INTO usage_limits (feature_key, daily_limit, description)
      VALUES 
        ('code_review', 20, 'AIコードレビュー依頼の1日あたりの制限回数'),
        ('ai_chat', 30, 'AIチャットボットの1日あたりの制限回数')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // テーブルの削除（逆順）
    await queryRunner.dropTable("usage_logs");
    await queryRunner.dropTable("usage_limits");
  }
}
