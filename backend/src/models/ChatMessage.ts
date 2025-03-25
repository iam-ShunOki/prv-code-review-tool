// backend/src/models/ChatMessage.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Review } from "./Review";

export enum ChatSender {
  USER = "user",
  AI = "ai",
}

@Entity("chat_messages")
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  review_id: number;

  @Column("text")
  content: string;

  @Column({
    type: "enum",
    enum: ChatSender,
    default: ChatSender.USER,
  })
  sender: ChatSender;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Review, { nullable: true })
  @JoinColumn({ name: "review_id" })
  review: Review;
}
