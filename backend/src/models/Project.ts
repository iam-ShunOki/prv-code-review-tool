// backend/src/models/Project.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { UserProject } from "./UserProject";
import { Review } from "./Review";

export enum ProjectStatus {
  PLANNING = "planning",
  ACTIVE = "active",
  COMPLETED = "completed",
  ARCHIVED = "archived",
}

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({
    type: "enum",
    enum: ProjectStatus,
    default: ProjectStatus.ACTIVE,
  })
  status: ProjectStatus;

  @Column({ type: "date", nullable: true })
  start_date: Date;

  @Column({ type: "date", nullable: true })
  end_date: Date;

  @Column({ nullable: true })
  backlog_project_key: string;

  @Column({ type: "text", nullable: true })
  backlog_repository_names: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // ユーザープロジェクト関連
  @OneToMany(() => UserProject, (userProject) => userProject.project)
  userProjects: UserProject[];

  // レビュー関連 - 明示的に定義し、カスケード動作を指定
  @OneToMany(() => Review, (review) => review.project)
  reviews: Review[];
}
