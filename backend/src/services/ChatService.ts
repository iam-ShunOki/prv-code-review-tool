// backend/src/services/ChatService.ts の getChatHistory メソッドを修正
import { AppDataSource } from "../index";
import { ChatMessage, ChatSender } from "../models/ChatMessage";
import { User } from "../models/User";
import { Review } from "../models/Review";

export class ChatService {
  private chatMessageRepository = AppDataSource.getRepository(ChatMessage);
  private userRepository = AppDataSource.getRepository(User);
  private reviewRepository = AppDataSource.getRepository(Review);

  /**
   * メッセージを保存（updated_atフィールドを手動でセット）
   */
  async saveMessage(
    userId: number,
    content: string,
    sender: ChatSender,
    sessionId: string,
    reviewId?: number
  ): Promise<ChatMessage> {
    console.log(
      `メッセージ保存: ユーザーID ${userId}, セッションID ${sessionId}, 送信者 ${sender}`
    );

    try {
      // ユーザーが存在するか確認
      const user = await this.userRepository.findOneBy({ id: userId });
      if (!user) {
        throw new Error(`ユーザーID ${userId} が見つかりません`);
      }

      // レビューが指定されている場合、存在するか確認
      if (reviewId) {
        const review = await this.reviewRepository.findOneBy({ id: reviewId });
        if (!review) {
          console.warn(
            `レビューID ${reviewId} が見つかりません。レビューIDなしでメッセージを保存します。`
          );
        }
      }

      // 現在の日時
      const now = new Date();

      // メッセージエンティティを直接作成してデータベースに保存
      // updated_atフィールドを回避するために、insert APIを使用
      const result = await this.chatMessageRepository.insert({
        user_id: userId,
        content: content,
        sender: sender,
        session_id: sessionId,
        review_id: reviewId,
        created_at: now,
      });

      // 挿入されたメッセージのIDを取得
      const messageId = result.identifiers[0].id;

      // 保存されたメッセージを取得して返す
      const savedMessage = await this.chatMessageRepository.findOneBy({
        id: messageId,
      });

      if (!savedMessage) {
        throw new Error(
          `保存したメッセージ (ID: ${messageId}) が見つかりません`
        );
      }

      console.log(`メッセージを保存しました: ID ${savedMessage.id}`);
      return savedMessage;
    } catch (error) {
      console.error("メッセージ保存エラー:", error);
      throw new Error(
        `メッセージの保存に失敗しました: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * チャット履歴の取得
   */
  async getChatHistory(
    userId: number,
    options: {
      reviewId?: number;
      sessionId?: string;
      limit?: number;
    }
  ): Promise<ChatMessage[]> {
    console.log(
      `チャット履歴取得: ユーザーID ${userId}, セッションID ${
        options.sessionId || "なし"
      }, レビューID ${options.reviewId || "なし"}`
    );

    try {
      // 検索条件を構築
      const queryBuilder = this.chatMessageRepository
        .createQueryBuilder("chat")
        .select([
          "chat.id",
          "chat.user_id",
          "chat.review_id",
          "chat.content",
          "chat.sender",
          "chat.session_id",
          "chat.created_at",
        ])
        .where("chat.user_id = :userId", { userId });

      // セッションIDが指定されている場合
      if (options.sessionId) {
        queryBuilder.andWhere("chat.session_id = :sessionId", {
          sessionId: options.sessionId,
        });
      }

      // レビューIDが指定されている場合
      if (options.reviewId) {
        queryBuilder.andWhere("chat.review_id = :reviewId", {
          reviewId: options.reviewId,
        });
      }

      // 並び順と取得件数
      queryBuilder
        .orderBy("chat.created_at", "ASC")
        .limit(options.limit || 100);

      // クエリを実行して結果を取得
      const messages = await queryBuilder.getMany();
      console.log(`${messages.length}件のメッセージを取得しました`);

      return messages;
    } catch (error) {
      console.error("チャット履歴取得エラー:", error);
      throw new Error(
        `チャット履歴の取得に失敗しました: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * ユーザーのチャットセッション一覧を取得
   */
  async getUserChatSessions(userId: number): Promise<any[]> {
    console.log(`ユーザーのチャットセッション一覧取得: ユーザーID ${userId}`);

    try {
      // ユーザーのセッション情報を集計するクエリ
      const query = `
        SELECT 
          chat.session_id,
          MIN(chat.created_at) as first_message_at,
          MAX(chat.created_at) as last_message_at,
          COUNT(chat.id) as message_count,
          r.id as review_id,
          r.title as review_title
        FROM 
          chat_messages chat
        LEFT JOIN
          reviews r ON chat.review_id = r.id
        WHERE 
          chat.user_id = ?
        GROUP BY 
          chat.session_id, r.id, r.title
        ORDER BY 
          last_message_at DESC
      `;

      // クエリ実行
      const sessions = await AppDataSource.query(query, [userId]);
      console.log(`${sessions.length}件のセッションを取得しました`);

      return sessions;
    } catch (error) {
      console.error("チャットセッション取得エラー:", error);
      throw new Error(
        `チャットセッションの取得に失敗しました: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 特定セッションのメッセージを取得
   */
  async getSessionMessages(
    userId: number,
    sessionId: string,
    limit: number = 100
  ): Promise<ChatMessage[]> {
    console.log(
      `セッションメッセージ取得: ユーザーID ${userId}, セッションID ${sessionId}`
    );

    try {
      const messages = await this.chatMessageRepository
        .createQueryBuilder("chat")
        .select([
          "chat.id",
          "chat.user_id",
          "chat.review_id",
          "chat.content",
          "chat.sender",
          "chat.session_id",
          "chat.created_at",
        ])
        .where("chat.user_id = :userId", { userId })
        .andWhere("chat.session_id = :sessionId", { sessionId })
        .orderBy("chat.created_at", "ASC")
        .limit(limit)
        .getMany();

      console.log(`${messages.length}件のメッセージを取得しました`);
      return messages;
    } catch (error) {
      console.error("セッションメッセージ取得エラー:", error);
      throw new Error(
        `セッションメッセージの取得に失敗しました: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * チャットメッセージの削除
   */
  async deleteMessages(
    userId: number,
    options: {
      sessionId?: string;
      reviewId?: number;
    }
  ): Promise<boolean> {
    console.log(
      `メッセージ削除: ユーザーID ${userId}, セッションID ${
        options.sessionId || "なし"
      }, レビューID ${options.reviewId || "なし"}`
    );

    try {
      // 検索条件を構築
      const queryBuilder = this.chatMessageRepository
        .createQueryBuilder()
        .delete()
        .from(ChatMessage)
        .where("user_id = :userId", { userId });

      // セッションIDが指定されている場合
      if (options.sessionId) {
        queryBuilder.andWhere("session_id = :sessionId", {
          sessionId: options.sessionId,
        });
      }

      // レビューIDが指定されている場合
      if (options.reviewId) {
        queryBuilder.andWhere("review_id = :reviewId", {
          reviewId: options.reviewId,
        });
      }

      // 削除クエリを実行
      const result = await queryBuilder.execute();
      console.log(`${result.affected || 0}件のメッセージを削除しました`);

      return true;
    } catch (error) {
      console.error("メッセージ削除エラー:", error);
      throw new Error(
        `メッセージの削除に失敗しました: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * レビュー関連のチャットコンテキスト情報を取得
   */
  async getReviewChatContext(reviewId: number): Promise<{
    reviewTitle?: string;
    recentMessages: { content: string; sender: string; created_at: Date }[];
    backlogInfo?: {
      pr_id?: number;
      project?: string;
      repository?: string;
    };
  }> {
    console.log(
      `レビューのチャットコンテキスト情報取得: レビューID ${reviewId}`
    );

    try {
      // レビュー情報を取得
      const review = await this.reviewRepository.findOne({
        where: { id: reviewId },
      });

      if (!review) {
        console.warn(`レビューID ${reviewId} が見つかりません`);
        return { recentMessages: [] };
      }

      // 最近のメッセージを取得（最新の10件）
      const recentMessages = await this.chatMessageRepository
        .createQueryBuilder("chat")
        .select(["chat.content", "chat.sender", "chat.created_at"])
        .where("chat.review_id = :reviewId", { reviewId })
        .orderBy("chat.created_at", "DESC")
        .limit(10)
        .getMany();

      // コンテキスト情報を構築
      const context = {
        reviewTitle: review.title,
        recentMessages: recentMessages,
        backlogInfo: undefined as any,
      };

      // Backlog情報がある場合は追加
      if (
        review.backlog_pr_id &&
        review.backlog_project &&
        review.backlog_repository
      ) {
        context.backlogInfo = {
          pr_id: review.backlog_pr_id,
          project: review.backlog_project,
          repository: review.backlog_repository,
        };
      }

      return context;
    } catch (error) {
      console.error("レビューコンテキスト情報取得エラー:", error);
      throw new Error(
        `レビューコンテキスト情報の取得に失敗しました: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
