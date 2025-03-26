import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionIdToChatMessages1625000001400
  implements MigrationInterface
{
  transaction?: boolean | undefined;
  name = "AddSessionIdToChatMessages1625000001400";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // session_idカラムを追加
    await queryRunner.query(
      `ALTER TABLE chat_messages ADD COLUMN session_id VARCHAR(100) NULL`
    );
    // インデックスの作成
    await queryRunner.query(
      `CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id)`
    );
    // すでにあるメッセージにランダムなセッションIDを割り当て（既存データがある場合）
    const existingMessages = await queryRunner.query(
      `SELECT DISTINCT user_id FROM chat_messages WHERE session_id IS NULL`
    );
    for (const row of existingMessages) {
      const userId = row.user_id;
      const sessionId = `session-${Date.now()}-${Math.floor(
        Math.random() * 10000
      )}`;
      await queryRunner.query(
        `UPDATE chat_messages SET session_id = ? WHERE user_id = ? AND session_id IS NULL`,
        [sessionId, userId]
      );
    }
    console.log("Successfully added session_id column to chat_messages table");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // インデックスの削除
    await queryRunner.query(
      `DROP INDEX idx_chat_messages_session_id ON chat_messages`
    );
    // カラムの削除
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN session_id`);
    console.log(
      "Successfully removed session_id column from chat_messages table"
    );
  }
}
