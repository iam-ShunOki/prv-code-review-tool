// backend/src/models/PullRequestTracker.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("pull_request_trackers")
export class PullRequestTracker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  project_key: string;

  @Column()
  repository_name: string;

  @Column()
  pull_request_id: number;

  @Column()
  processed_at: Date;

  // 新規追加フィールド
  @Column({ default: 1 })
  review_count: number;

  @Column({ nullable: true })
  last_review_at: Date;

  @Column({ type: "text", nullable: true })
  review_history: string;

  // コメントIDを追跡するための新フィールド（JSON形式で保存）
  @Column({ type: "text", nullable: true, default: "[]" })
  processed_comment_ids: string;

  @CreateDateColumn()
  created_at: Date;
}
