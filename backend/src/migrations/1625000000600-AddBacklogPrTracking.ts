// backend/src/migrations/1625000000600-AddBacklogPrTracking.ts
import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddBacklogPrTracking1625000000600 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to reviews table
    await queryRunner.query(`
      ALTER TABLE reviews 
      ADD COLUMN backlog_pr_id INT NULL,
      ADD COLUMN backlog_project VARCHAR(255) NULL,
      ADD COLUMN backlog_repository VARCHAR(255) NULL
    `);

    // Create pull_request_trackers table
    await queryRunner.createTable(
      new Table({
        name: "pull_request_trackers",
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
            name: "pull_request_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "processed_at",
            type: "timestamp",
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
      }),
      true
    );

    // Add a unique constraint on project_key, repository_name, pull_request_id
    await queryRunner.query(`
      ALTER TABLE pull_request_trackers
      ADD CONSTRAINT UK_pull_request_trackers_project_repo_pr
      UNIQUE (project_key, repository_name, pull_request_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the unique constraint
    await queryRunner.query(`
      ALTER TABLE pull_request_trackers
      DROP CONSTRAINT UK_pull_request_trackers_project_repo_pr
    `);

    // Drop the pull_request_trackers table
    await queryRunner.dropTable("pull_request_trackers");

    // Remove columns from reviews table
    await queryRunner.query(`
      ALTER TABLE reviews
      DROP COLUMN backlog_pr_id,
      DROP COLUMN backlog_project,
      DROP COLUMN backlog_repository
    `);
  }
}
