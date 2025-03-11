// backend/src/migrations/1625000000200-AddNotificationSettingsTable.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationSettingsTable1625000000200
  implements MigrationInterface
{
  name = "AddNotificationSettingsTable1625000000200";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 通知設定テーブルの作成
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email_notifications BOOLEAN NOT NULL DEFAULT true,
        review_completed BOOLEAN NOT NULL DEFAULT true,
        feedback_received BOOLEAN NOT NULL DEFAULT true,
        level_changed BOOLEAN NOT NULL DEFAULT true,
        system_notifications BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // インデックスの作成
    await queryRunner.query(
      `CREATE INDEX idx_notification_settings_user_id ON notification_settings(user_id)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // テーブル削除
    await queryRunner.query(`DROP TABLE IF EXISTS notification_settings`);
  }
}
