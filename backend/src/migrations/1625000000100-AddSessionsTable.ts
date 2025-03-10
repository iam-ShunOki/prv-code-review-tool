import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionsTable1625000000100 implements MigrationInterface {
  name = "AddSessionsTable1625000000100";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // セッションテーブルの作成
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                session_token VARCHAR(255) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

    // インデックスの作成
    await queryRunner.query(
      `CREATE INDEX idx_sessions_token ON sessions(session_token)`
    );
    await queryRunner.query(
      `CREATE INDEX idx_sessions_user_id ON sessions(user_id)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // テーブル削除
    await queryRunner.query(`DROP TABLE IF EXISTS sessions`);
  }
}
