// backend/src/migrations/1625000001300-CreateChatMessagesTable.ts
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateChatMessagesTable1625000001300
  implements MigrationInterface
{
  name = "CreateChatMessagesTable1625000001300";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // チャットメッセージテーブルの作成
    await queryRunner.createTable(
      new Table({
        name: "chat_messages",
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
            name: "review_id",
            type: "int",
            isNullable: true,
          },
          {
            name: "content",
            type: "text",
            isNullable: false,
          },
          {
            name: "sender",
            type: "enum",
            enum: ["user", "ai"],
            default: "'user'",
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            name: "idx_chat_messages_user_id",
            columnNames: ["user_id"],
          },
          {
            name: "idx_chat_messages_review_id",
            columnNames: ["review_id"],
          },
        ],
      }),
      true
    );

    // 外部キーの追加
    await queryRunner.createForeignKey(
      "chat_messages",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "chat_messages",
      new TableForeignKey({
        columnNames: ["review_id"],
        referencedTableName: "reviews",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 外部キーの削除
    const table = await queryRunner.getTable("chat_messages");

    if (table) {
      const userForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("user_id") !== -1
      );

      const reviewForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf("review_id") !== -1
      );

      if (userForeignKey) {
        await queryRunner.dropForeignKey("chat_messages", userForeignKey);
      }

      if (reviewForeignKey) {
        await queryRunner.dropForeignKey("chat_messages", reviewForeignKey);
      }
    }

    // テーブルの削除
    await queryRunner.dropTable("chat_messages");
  }
}
