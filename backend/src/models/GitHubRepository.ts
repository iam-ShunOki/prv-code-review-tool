// backend/src/models/GitHubRepository.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { GitHubPullRequestTracker } from "./GitHubPullRequestTracker";

@Entity("github_repositories")
export class GitHubRepository {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  owner: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255, nullable: true })
  access_token: string;

  @Column({ length: 255, nullable: true })
  webhook_secret: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: true })
  allow_auto_review: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => GitHubPullRequestTracker, (tracker) => tracker.repository)
  pullRequestTrackers: GitHubPullRequestTracker[];
}
