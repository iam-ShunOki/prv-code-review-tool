// backend/src/models/UsageLimit.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("usage_limits")
export class UsageLimit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  feature_key: string;

  @Column({ default: 10 })
  daily_limit: number;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
