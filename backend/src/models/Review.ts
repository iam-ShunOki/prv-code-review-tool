import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  // 既存のインポート
} from "typeorm";
import { User } from "./User";
import { CodeSubmission } from "./CodeSubmission";
import { Project } from "./Project";

export enum ReviewStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}

@Entity("reviews")
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  title: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({
    type: "enum",
    enum: ReviewStatus,
    default: ReviewStatus.PENDING,
  })
  status: ReviewStatus;

  @Column({ nullable: true })
  backlog_pr_id: number;

  @Column({ nullable: true, length: 255 })
  backlog_project: string;

  @Column({ nullable: true, length: 255 })
  backlog_repository: string;

  // 新しいカラムとリレーションを追加
  @Column({ nullable: true })
  project_id: number;

  @ManyToOne(() => Project, (project) => project.reviews, {
    nullable: true,
    onDelete: "SET NULL", // プロジェクトが削除された場合の動作
  })
  @JoinColumn({ name: "project_id" })
  project: Project;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, (user) => user.reviews)
  @JoinColumn({ name: "user_id" })
  user: User;

  @OneToMany(() => CodeSubmission, (submission) => submission.review)
  submissions: CodeSubmission[];
}
