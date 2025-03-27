// backend/src/models/ChatMessage.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Review } from "./Review";

// チャットの送信者タイプ
export enum ChatSender {
  USER = "user",
  AI = "ai",
}

@Entity({ name: "chat_messages" })
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  review_id?: number;

  @Column({ type: "text" })
  content: string;

  @Column({
    type: "enum",
    enum: ChatSender,
    default: ChatSender.USER,
  })
  sender: ChatSender;

  @Column({ nullable: true })
  session_id?: string;

  @Column({ nullable: true })
  parent_message_id?: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // リレーションシップ
  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Review, { nullable: true })
  @JoinColumn({ name: "review_id" })
  review?: Review;
}
