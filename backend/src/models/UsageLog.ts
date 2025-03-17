// backend/src/models/UsageLog.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";

@Entity("usage_logs")
export class UsageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ length: 50 })
  feature_key: string;

  @Index()
  @CreateDateColumn()
  used_at: Date;

  @Column({ length: 100, nullable: true })
  request_id: string;

  @Column({ type: "text", nullable: true })
  metadata: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;
}
