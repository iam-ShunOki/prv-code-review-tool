// backend/src/migrations/1625000001700-AddParentMessageIdToChatMessages.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddParentMessageIdToChatMessages1625000001700
  implements MigrationInterface
{
  name = "AddParentMessageIdToChatMessages1625000001700";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("parent_message_idカラムをchat_messagesテーブルに追加します");

    try {
      // parent_message_idカラムを追加
      await queryRunner.query(`
        ALTER TABLE chat_messages
        ADD COLUMN parent_message_id INT NULL,
        ADD CONSTRAINT FK_chat_messages_parent_id 
        FOREIGN KEY (parent_message_id) 
        REFERENCES chat_messages(id) 
        ON DELETE SET NULL
      `);

      // インデックスの作成
      await queryRunner.query(`
        CREATE INDEX idx_chat_messages_parent_id ON chat_messages(parent_message_id)
      `);

      console.log("parent_message_idカラムの追加が完了しました");
    } catch (error) {
      console.error("マイグレーション実行中にエラーが発生しました:", error);
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("parent_message_idカラムをchat_messagesテーブルから削除します");

    try {
      // 外部キー制約の削除
      await queryRunner.query(`
        ALTER TABLE chat_messages
        DROP FOREIGN KEY FK_chat_messages_parent_id
      `);

      // インデックスの削除
      await queryRunner.query(`
        DROP INDEX idx_chat_messages_parent_id ON chat_messages
      `);

      // カラムの削除
      await queryRunner.query(`
        ALTER TABLE chat_messages
        DROP COLUMN parent_message_id
      `);

      console.log("parent_message_idカラムの削除が完了しました");
    } catch (error) {
      console.error(
        "マイグレーションロールバック中にエラーが発生しました:",
        error
      );
      throw error;
    }
  }
}
