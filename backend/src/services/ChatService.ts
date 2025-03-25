// backend/src/services/ChatService.ts
import { AppDataSource } from "../index";
import { ChatMessage, ChatSender } from "../models/ChatMessage";

export class ChatService {
  private chatRepository = AppDataSource.getRepository(ChatMessage);

  /**
   * チャットメッセージを保存
   */
  async saveMessage(
    userId: number,
    content: string,
    sender: ChatSender,
    reviewId?: number
  ): Promise<ChatMessage> {
    try {
      const message = new ChatMessage();
      message.user_id = userId;
      message.content = content;
      message.sender = sender;

      if (reviewId) {
        message.review_id = reviewId;
      }

      return await this.chatRepository.save(message);
    } catch (error) {
      console.error("チャットメッセージ保存エラー:", error);
      throw new Error(
        `チャットメッセージの保存に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * ユーザーのチャット履歴を取得（特定のレビューに関連するメッセージのみを取得することも可能）
   */
  async getChatHistory(
    userId: number,
    reviewId?: number,
    limit: number = 100
  ): Promise<ChatMessage[]> {
    try {
      // クエリビルダーを使用して検索条件を構築
      const queryBuilder = this.chatRepository
        .createQueryBuilder("chat")
        .where("chat.user_id = :userId", { userId })
        .orderBy("chat.created_at", "ASC")
        .take(limit);

      // レビューIDが指定されている場合は条件に追加
      if (reviewId) {
        queryBuilder.andWhere("chat.review_id = :reviewId", { reviewId });
      }

      return await queryBuilder.getMany();
    } catch (error) {
      console.error("チャット履歴取得エラー:", error);
      throw new Error(
        `チャット履歴の取得に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 指定されたレビューに関連するチャットの件数を取得
   */
  async getMessageCountForReview(reviewId: number): Promise<number> {
    try {
      return await this.chatRepository.count({
        where: { review_id: reviewId },
      });
    } catch (error) {
      console.error(`レビュー(${reviewId})のメッセージ数取得エラー:`, error);
      return 0;
    }
  }

  /**
   * 古いチャットメッセージを削除（データベース肥大化防止）
   * 例えば90日以上前のメッセージを削除など
   */
  async pruneOldMessages(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.chatRepository
        .createQueryBuilder()
        .delete()
        .from(ChatMessage)
        .where("created_at < :cutoffDate", { cutoffDate })
        .execute();

      return result.affected || 0;
    } catch (error) {
      console.error("古いチャットメッセージの削除エラー:", error);
      return 0;
    }
  }
}
