// backend/src/services/UsageLimitService.ts
import { AppDataSource } from "../index";
import { Between, LessThan } from "typeorm";
import { UsageLimit } from "../models/UsageLimit";
import { UsageLog } from "../models/UsageLog";
import { User } from "../models/User";

export class UsageLimitService {
  private usageLimitRepository = AppDataSource.getRepository(UsageLimit);
  private usageLogRepository = AppDataSource.getRepository(UsageLog);
  private userRepository = AppDataSource.getRepository(User);

  /**
   * 特定の機能の利用制限を取得
   */
  async getLimitByFeature(featureKey: string): Promise<UsageLimit | null> {
    return this.usageLimitRepository.findOne({
      where: {
        feature_key: featureKey,
        is_active: true,
      },
    });
  }

  /**
   * すべての機能の利用制限を取得
   */
  async getAllLimits(): Promise<UsageLimit[]> {
    return this.usageLimitRepository.find({
      order: {
        feature_key: "ASC",
      },
    });
  }

  /**
   * 利用制限を更新
   */
  async updateLimit(
    featureKey: string,
    dailyLimit: number,
    description?: string
  ): Promise<UsageLimit> {
    const limit = await this.usageLimitRepository.findOne({
      where: { feature_key: featureKey },
    });

    if (!limit) {
      throw new Error("指定された機能の利用制限が見つかりません");
    }

    limit.daily_limit = dailyLimit;
    if (description !== undefined) {
      limit.description = description;
    }

    return this.usageLimitRepository.save(limit);
  }

  /**
   * 利用ログを記録
   */
  async logUsage(
    userId: number,
    featureKey: string,
    requestId?: string,
    metadata?: any
  ): Promise<UsageLog> {
    const log = new UsageLog();
    log.user_id = userId;
    log.feature_key = featureKey;
    log.request_id = requestId || "";

    if (metadata) {
      log.metadata = JSON.stringify(metadata);
    }

    return this.usageLogRepository.save(log);
  }

  /**
   * 今日の利用回数を取得
   */
  async getTodayUsageCount(
    userId: number,
    featureKey: string
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await this.usageLogRepository.count({
      where: {
        user_id: userId,
        feature_key: featureKey,
        used_at: Between(today, tomorrow),
      },
    });

    return count;
  }

  /**
   * 今日の残り利用可能回数を取得
   */
  async getRemainingUsage(userId: number, featureKey: string): Promise<number> {
    const limit = await this.getLimitByFeature(featureKey);
    if (!limit || !limit.is_active) {
      return 0; // 制限が設定されていないか非アクティブな場合は0を返す
    }

    const todayUsage = await this.getTodayUsageCount(userId, featureKey);
    return Math.max(0, limit.daily_limit - todayUsage);
  }

  /**
   * 利用可能かどうかチェック
   */
  async canUseFeature(
    userId: number,
    featureKey: string
  ): Promise<{ canUse: boolean; remaining: number; limit: number }> {
    // 管理者は常に利用可能
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (user && user.role === "admin") {
      return { canUse: true, remaining: 999, limit: 999 };
    }

    const limit = await this.getLimitByFeature(featureKey);
    if (!limit || !limit.is_active) {
      return { canUse: false, remaining: 0, limit: 0 };
    }

    const remaining = await this.getRemainingUsage(userId, featureKey);
    return {
      canUse: remaining > 0,
      remaining,
      limit: limit.daily_limit,
    };
  }

  /**
   * ユーザーの機能利用状況サマリーを取得
   */
  async getUserUsageSummary(userId: number): Promise<{
    [key: string]: {
      used: number;
      limit: number;
      remaining: number;
      canUse: boolean;
    };
  }> {
    try {
      // デフォルトの制限値（テーブルが存在しない場合の対応）
      const defaultLimits = {
        code_review: {
          used: 0,
          limit: 20,
          remaining: 20,
          canUse: true,
        },
        ai_chat: {
          used: 0,
          limit: 30,
          remaining: 30,
          canUse: true,
        },
      };

      // テーブルがまだ存在しない場合にエラーを避けるためのチェック
      const tableExists = await this.checkTableExists("usage_limits");
      if (!tableExists) {
        console.warn(
          "usage_limits テーブルが存在しません。デフォルト値を返します。"
        );
        return defaultLimits;
      }

      const limits = await this.getAllLimits();

      // 制限が設定されていない場合はデフォルト値を返す
      if (!limits || limits.length === 0) {
        console.warn("利用制限が設定されていません。デフォルト値を返します。");
        return defaultLimits;
      }

      const result: any = {};

      for (const limit of limits) {
        if (limit.is_active) {
          let used = 0;
          try {
            used = await this.getTodayUsageCount(userId, limit.feature_key);
          } catch (error) {
            console.error(
              `利用回数の取得エラー (feature: ${limit.feature_key}):`,
              error
            );
            // エラーが発生しても処理を続行
          }

          const remaining = Math.max(0, limit.daily_limit - used);

          result[limit.feature_key] = {
            used,
            limit: limit.daily_limit,
            remaining,
            canUse: remaining > 0,
          };
        }
      }

      // 必須の機能キーが存在しない場合、デフォルト値を追加
      if (!result.code_review) {
        result.code_review = defaultLimits.code_review;
      }
      if (!result.ai_chat) {
        result.ai_chat = defaultLimits.ai_chat;
      }

      return result;
    } catch (error) {
      console.error("利用状況サマリー取得エラー:", error);
      // エラーが発生した場合はデフォルト値を返す
      return {
        code_review: {
          used: 0,
          limit: 20,
          remaining: 20,
          canUse: true,
        },
        ai_chat: {
          used: 0,
          limit: 30,
          remaining: 30,
          canUse: true,
        },
      };
    }
  }

  /**
   * テーブルが存在するかチェック
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const query = `
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?
      `;

      const result = await AppDataSource.query(query, [tableName]);
      return result.length > 0;
    } catch (error) {
      console.error(`テーブル存在チェックエラー (${tableName}):`, error);
      return false;
    }
  }

  /**
   * すべてのユーザーの今日の利用状況を取得（管理者用）
   */
  async getAllUsersUsageToday(): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // すべての今日のログを取得
    const logs = await this.usageLogRepository.find({
      where: {
        used_at: Between(today, tomorrow),
      },
      relations: ["user"],
    });

    // ユーザーごと、機能ごとに集計
    const usageMap = new Map();

    logs.forEach((log) => {
      const key = `${log.user_id}-${log.feature_key}`;
      if (!usageMap.has(key)) {
        usageMap.set(key, {
          user_id: log.user_id,
          user_name: log.user?.name || "Unknown",
          feature_key: log.feature_key,
          count: 0,
        });
      }
      usageMap.get(key).count++;
    });

    return Array.from(usageMap.values());
  }
}
