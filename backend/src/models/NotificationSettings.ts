// backend/src/models/NotificationSettings.ts
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

@Entity("notification_settings")
export class NotificationSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ default: true })
  email_notifications: boolean;

  @Column({ default: true })
  review_completed: boolean;

  @Column({ default: true })
  feedback_received: boolean;

  @Column({ default: true })
  level_changed: boolean;

  @Column({ default: true })
  system_notifications: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;
}
