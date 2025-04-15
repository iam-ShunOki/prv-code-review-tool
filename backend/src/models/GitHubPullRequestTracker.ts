// backend/src/models/GitHubPullRequestTracker.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { GitHubRepository } from "./GitHubRepository";

@Entity("github_pull_request_trackers")
export class GitHubPullRequestTracker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  repository_id: number;

  @Column({ length: 255 })
  owner: string;

  @Column({ length: 255 })
  repo: string;

  @Column()
  pull_request_id: number;

  @Column()
  processed_at: Date;

  @Column({ default: 1 })
  review_count: number;

  @Column({ nullable: true })
  last_review_at: Date;

  @Column({ type: "text", nullable: true })
  review_history: string;

  @Column({ type: "text", nullable: true, default: "[]" })
  processed_comment_ids: string;

  @Column({ type: "text", nullable: true, default: "[]" })
  ai_review_comment_ids: string; // 新規追加: AIが投稿したレビューコメントのID

  @Column({ default: false })
  description_processed: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(
    () => GitHubRepository,
    (repository) => repository.pullRequestTrackers,
    { onDelete: "CASCADE" }
  )
  @JoinColumn({ name: "repository_id" })
  repository: GitHubRepository;
}
