import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateGitHubRepositoryTable1625000002100
  implements MigrationInterface
{
  name = "CreateGitHubRepositoryTable1625000002100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("GitHubリポジトリテーブルを作成します");

    await queryRunner.createTable(
      new Table({
        name: "github_repositories",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "owner",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "access_token",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "webhook_secret",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
          },
          {
            name: "allow_auto_review",
            type: "boolean",
            default: true,
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
            name: "idx_github_repo_owner_name",
            columnNames: ["owner", "name"],
            isUnique: true,
          },
        ],
      }),
      true
    );

    console.log("GitHubリポジトリテーブルの作成が完了しました");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("GitHubリポジトリテーブルを削除します");
    await queryRunner.dropTable("github_repositories");
    console.log("GitHubリポジトリテーブルの削除が完了しました");
  }
}
