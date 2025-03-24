// backend/src/migrations/1625000000900-AddProjectAndGroupManagement.ts
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class AddProjectAndGroupManagement1625000000900
  implements MigrationInterface
{
  name = "AddProjectAndGroupManagement1625000000900";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. プロジェクトテーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "projects",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "code",
            type: "varchar",
            length: "50",
            isNullable: false,
            isUnique: true,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "status",
            type: "enum",
            enum: ["planning", "active", "completed", "archived"],
            default: "'active'",
          },
          {
            name: "start_date",
            type: "date",
            isNullable: true,
          },
          {
            name: "end_date",
            type: "date",
            isNullable: true,
          },
          {
            name: "backlog_project_key",
            type: "varchar",
            length: "50",
            isNullable: true,
          },
          {
            name: "backlog_repository_names",
            type: "text",
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
      }),
      true
    );

    // 2. ユーザープロジェクト関連テーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "user_projects",
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
          },
          {
            name: "project_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "role",
            type: "enum",
            enum: ["manager", "leader", "member", "reviewer", "observer"],
            default: "'member'",
          },
          {
            name: "joined_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "idx_user_projects_user_id",
            columnNames: ["user_id"],
          },
          {
            name: "idx_user_projects_project_id",
            columnNames: ["project_id"],
          },
          {
            name: "idx_unique_user_project",
            columnNames: ["user_id", "project_id"],
            isUnique: true,
          },
        ],
      }),
      true
    );

    // 3. ユーザーグループテーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "user_groups",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: "true",
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

    // 4. ユーザーグループメンバーテーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "user_group_members",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "group_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "user_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "role",
            type: "enum",
            enum: ["manager", "leader", "member", "reviewer", "observer"],
            default: "'member'",
          },
          {
            name: "joined_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "idx_user_group_members_group_id",
            columnNames: ["group_id"],
          },
          {
            name: "idx_user_group_members_user_id",
            columnNames: ["user_id"],
          },
          {
            name: "idx_unique_group_user",
            columnNames: ["group_id", "user_id"],
            isUnique: true,
          },
        ],
      }),
      true
    );

    // 5. レビューテーブルに project_id カラムを追加
    await queryRunner.query(`
      ALTER TABLE reviews
      ADD COLUMN project_id INT NULL
    `);

    // 6. 外部キー制約の追加
    // user_projects テーブルの外部キー
    await queryRunner.createForeignKey(
      "user_projects",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "user_projects",
      new TableForeignKey({
        columnNames: ["project_id"],
        referencedTableName: "projects",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    // user_group_members テーブルの外部キー
    await queryRunner.createForeignKey(
      "user_group_members",
      new TableForeignKey({
        columnNames: ["group_id"],
        referencedTableName: "user_groups",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "user_group_members",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    // reviews テーブルの外部キー
    await queryRunner.createForeignKey(
      "reviews",
      new TableForeignKey({
        columnNames: ["project_id"],
        referencedTableName: "projects",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      })
    );

    // インデックスの作成
    await queryRunner.query(
      `CREATE INDEX idx_reviews_project_id ON reviews(project_id)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      // 外部キー制約の削除
      const reviewsTable = await queryRunner.getTable("reviews");
      const userProjectsTable = await queryRunner.getTable("user_projects");
      const userGroupMembersTable = await queryRunner.getTable(
        "user_group_members"
      );

      if (reviewsTable) {
        const projectForeignKey = reviewsTable.foreignKeys.find(
          (fk) => fk.columnNames.indexOf("project_id") !== -1
        );
        if (projectForeignKey) {
          await queryRunner.dropForeignKey("reviews", projectForeignKey);
        }
      }

      if (userProjectsTable) {
        const userForeignKey = userProjectsTable.foreignKeys.find(
          (fk) => fk.columnNames.indexOf("user_id") !== -1
        );
        if (userForeignKey) {
          await queryRunner.dropForeignKey("user_projects", userForeignKey);
        }

        const projectForeignKey = userProjectsTable.foreignKeys.find(
          (fk) => fk.columnNames.indexOf("project_id") !== -1
        );
        if (projectForeignKey) {
          await queryRunner.dropForeignKey("user_projects", projectForeignKey);
        }
      }

      if (userGroupMembersTable) {
        const groupForeignKey = userGroupMembersTable.foreignKeys.find(
          (fk) => fk.columnNames.indexOf("group_id") !== -1
        );
        if (groupForeignKey) {
          await queryRunner.dropForeignKey(
            "user_group_members",
            groupForeignKey
          );
        }

        const userForeignKey = userGroupMembersTable.foreignKeys.find(
          (fk) => fk.columnNames.indexOf("user_id") !== -1
        );
        if (userForeignKey) {
          await queryRunner.dropForeignKey(
            "user_group_members",
            userForeignKey
          );
        }
      }

      // インデックスが存在するか確認してから削除
      const indexExistsQuery = `
        SELECT COUNT(1) as indexExists 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'reviews' 
        AND index_name = 'idx_reviews_project_id'
      `;
      const indexExists = await queryRunner.query(indexExistsQuery);

      if (indexExists[0].indexExists > 0) {
        await queryRunner.query(`DROP INDEX idx_reviews_project_id ON reviews`);
      }

      // カラムが存在するか確認してから削除
      const columnExistsQuery = `
        SELECT COUNT(1) as columnExists 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'reviews' 
        AND column_name = 'project_id'
      `;
      const columnExists = await queryRunner.query(columnExistsQuery);

      if (columnExists[0].columnExists > 0) {
        await queryRunner.query(`ALTER TABLE reviews DROP COLUMN project_id`);
      }

      // テーブルの削除（作成の逆順）
      await queryRunner.dropTable("user_group_members", true);
      await queryRunner.dropTable("user_groups", true);
      await queryRunner.dropTable("user_projects", true);
      await queryRunner.dropTable("projects", true);
    } catch (error) {
      console.error(
        "エラーがマイグレーションのロールバック中に発生しました:",
        error
      );
      throw error;
    }
  }
}
