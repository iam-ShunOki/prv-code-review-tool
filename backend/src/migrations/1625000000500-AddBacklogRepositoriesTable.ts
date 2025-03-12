// backend/src/migrations/1625000000500-AddBacklogRepositoriesTable.ts
import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddBacklogRepositoriesTable1625000000500
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "backlog_repositories",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "project_key",
            type: "varchar",
            length: "50",
            isNullable: false,
          },
          {
            name: "project_name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "repository_name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "repository_id",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "main_branch",
            type: "varchar",
            length: "100",
            default: "'master'",
          },
          {
            name: "status",
            type: "enum",
            enum: ["registered", "cloned", "vectorized", "failed"],
            default: "'registered'",
          },
          {
            name: "last_sync_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: false,
          },
          {
            name: "error_message",
            type: "text",
            isNullable: true,
          },
          {
            name: "vectorstore_collection",
            type: "varchar",
            length: "255",
            isNullable: true,
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
            name: "idx_project_repository",
            columnNames: ["project_key", "repository_name"],
            isUnique: true,
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("backlog_repositories");
  }
}
