// backend/src/services/NotificationService.ts
import { AppDataSource } from "../index";
import { NotificationSettings } from "../models/NotificationSettings";
import { User } from "../models/User";

export class NotificationService {
  private notificationSettingsRepository =
    AppDataSource.getRepository(NotificationSettings);

  /**
   * ユーザーの通知設定を取得
   */
  async getNotificationSettings(userId: number): Promise<NotificationSettings> {
    try {
      // ユーザーの通知設定を取得
      let settings = await this.notificationSettingsRepository.findOne({
        where: { user_id: userId },
        relations: ["user"], // userエンティティを取得
      });

      // 設定が存在しない場合は新規作成
      if (!settings) {
        // まずuserを取得
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({ where: { id: userId } });

        if (!user) {
          throw new Error("ユーザーが見つかりません");
        }

        settings = this.notificationSettingsRepository.create({
          user_id: userId,
          email_notifications: true,
          review_completed: true,
          feedback_received: true,
          level_changed: true,
          system_notifications: true,
          user: user, // userエンティティをセット
        });
        await this.notificationSettingsRepository.save(settings);
      }

      return settings;
    } catch (error) {
      console.error("通知設定取得エラー:", error);

      // エラーを上位に伝播させる
      throw new Error("通知設定の取得に失敗しました");
    }
  }

  /**
   * 通知設定を更新
   */
  async updateNotificationSettings(
    userId: number,
    settings: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    try {
      // 現在の設定を取得
      let currentSettings = await this.notificationSettingsRepository.findOne({
        where: { user_id: userId },
      });

      // 設定が存在しない場合は新規作成
      if (!currentSettings) {
        currentSettings = this.notificationSettingsRepository.create({
          user_id: userId,
          email_notifications: true,
          review_completed: true,
          feedback_received: true,
          level_changed: true,
          system_notifications: true,
          ...settings,
        });
      } else {
        // 既存の設定を更新
        this.notificationSettingsRepository.merge(currentSettings, settings);
      }

      // 保存して結果を返す
      return this.notificationSettingsRepository.save(currentSettings);
    } catch (error) {
      console.error("通知設定更新エラー:", error);
      throw new Error("通知設定の更新に失敗しました");
    }
  }

  /**
   * 通知を送信（メール or システム通知）
   * 注: 実際のメール送信機能は別途実装が必要
   */
  async sendNotification(
    userId: number,
    notificationType: string,
    title: string,
    message: string
  ): Promise<boolean> {
    try {
      // ユーザーの通知設定を取得
      const settings = await this.getNotificationSettings(userId);

      // 通知タイプに応じた設定をチェック
      let shouldSend = false;

      switch (notificationType) {
        case "review_completed":
          shouldSend = settings.review_completed;
          break;
        case "feedback_received":
          shouldSend = settings.feedback_received;
          break;
        case "level_changed":
          shouldSend = settings.level_changed;
          break;
        case "system":
          shouldSend = settings.system_notifications;
          break;
        default:
          shouldSend = true;
      }

      if (!shouldSend) {
        return false;
      }

      // メール通知が有効な場合
      if (settings.email_notifications) {
        // TODO: 実際のメール送信処理を実装
        console.log(`メール通知送信（仮）: ${title} - ${message}`);
      }

      // システム通知を記録（将来的な実装用）
      console.log(`システム通知記録（仮）: ${title} - ${message}`);

      return true;
    } catch (error) {
      console.error("通知送信エラー:", error);
      return false;
    }
  }
}
