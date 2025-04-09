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

  @Column({ type: "text", default: "[]" })
  processed_comment_ids: string;

  @Column({ default: false })
  description_processed: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => GitHubRepository, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repository_id" })
  repository: GitHubRepository;
}
