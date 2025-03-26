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
    sessionId?: string,
    reviewId?: number
  ): Promise<ChatMessage> {
    try {
      const message = new ChatMessage();
      message.user_id = userId;
      message.content = content;
      message.sender = sender;

      if (sessionId) {
        message.session_id = sessionId;
      }

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
   * ユーザーのチャット履歴を取得（特定のレビューやセッションに関連するメッセージのみを取得することも可能）
   */
  async getChatHistory(
    userId: number,
    options?: {
      reviewId?: number;
      sessionId?: string;
      limit?: number;
    }
  ): Promise<ChatMessage[]> {
    try {
      const limit = options?.limit || 100;

      // クエリビルダーを使用して検索条件を構築
      const queryBuilder = this.chatRepository
        .createQueryBuilder("chat")
        .where("chat.user_id = :userId", { userId })
        .orderBy("chat.created_at", "ASC")
        .take(limit);

      // レビューIDが指定されている場合は条件に追加
      if (options?.reviewId) {
        queryBuilder.andWhere("chat.review_id = :reviewId", {
          reviewId: options.reviewId,
        });
      }

      // セッションIDが指定されている場合は条件に追加
      if (options?.sessionId) {
        queryBuilder.andWhere("chat.session_id = :sessionId", {
          sessionId: options.sessionId,
        });
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
   * ユーザーの一意なセッションリストを取得
   */
  async getUserChatSessions(userId: number): Promise<any[]> {
    try {
      // セッションごとに最新のメッセージを取得
      const query = `
        SELECT 
          cm.session_id, 
          MAX(cm.created_at) as last_message_time,
          (
            SELECT content 
            FROM chat_messages 
            WHERE user_id = ? AND session_id = cm.session_id 
            ORDER BY created_at ASC 
            LIMIT 1
          ) as first_message,
          COUNT(*) as message_count
        FROM 
          chat_messages cm
        WHERE 
          cm.user_id = ?
          AND cm.session_id IS NOT NULL
        GROUP BY 
          cm.session_id
        ORDER BY 
          last_message_time DESC
        LIMIT 50
      `;

      const results = await this.chatRepository.query(query, [userId, userId]);

      // 各セッションの最初のメッセージからタイトルを抽出
      return results.map((row: any) => {
        // 最初のメッセージから30文字以内でタイトルを作成
        const title = row.first_message
          ? row.first_message.substring(0, 30) +
            (row.first_message.length > 30 ? "..." : "")
          : `セッション ${row.session_id.substring(0, 8)}`;

        return {
          session_id: row.session_id,
          title,
          last_activity: row.last_message_time,
          message_count: row.message_count,
          preview: row.first_message,
          created_at: row.last_message_time,
        };
      });
    } catch (error) {
      console.error("チャットセッション取得エラー:", error);
      throw new Error(
        `チャットセッションの取得に失敗しました: ${
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
