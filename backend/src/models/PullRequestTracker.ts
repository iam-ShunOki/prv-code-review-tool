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

  @CreateDateColumn()
  created_at: Date;
}
