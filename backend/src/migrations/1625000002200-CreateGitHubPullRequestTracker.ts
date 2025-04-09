import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateGitHubPullRequestTracker1625000002200
  implements MigrationInterface
{
  name = "CreateGitHubPullRequestTracker1625000002200";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("GitHub PR トラッカーテーブルを作成します");

    await queryRunner.createTable(
      new Table({
        name: "github_pull_request_trackers",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "repository_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "owner",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "repo",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "pull_request_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "processed_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "review_count",
            type: "int",
            default: 1,
          },
          {
            name: "last_review_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "review_history",
            type: "text",
            isNullable: true,
          },
          {
            name: "processed_comment_ids",
            type: "text",
            default: undefined,
          },
          {
            name: "description_processed",
            type: "boolean",
            default: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "idx_github_pr_owner_repo_pr",
            columnNames: ["owner", "repo", "pull_request_id"],
            isUnique: true,
          },
          {
            name: "idx_github_pr_repository_id",
            columnNames: ["repository_id"],
          },
        ],
      }),
      true
    );

    // 外部キー制約の追加
    await queryRunner.createForeignKey(
      "github_pull_request_trackers",
      new TableForeignKey({
        columnNames: ["repository_id"],
        referencedTableName: "github_repositories",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    console.log("GitHub PR トラッカーテーブルの作成が完了しました");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("GitHub PR トラッカーテーブルを削除します");

    // 外部キー制約の削除
    const table = await queryRunner.getTable("github_pull_request_trackers");
    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("repository_id") !== -1
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey(
          "github_pull_request_trackers",
          foreignKey
        );
      }
    }

    // テーブルの削除
    await queryRunner.dropTable("github_pull_request_trackers");

    console.log("GitHub PR トラッカーテーブルの削除が完了しました");
  }
}
