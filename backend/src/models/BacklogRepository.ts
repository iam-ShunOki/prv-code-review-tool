// backend/src/models/BacklogRepository.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum RepositoryStatus {
  REGISTERED = "registered",
  CLONED = "cloned",
  VECTORIZED = "vectorized",
  FAILED = "failed",
}

@Entity("backlog_repositories")
export class BacklogRepository {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  project_key: string;

  @Column()
  project_name: string;

  @Column()
  repository_name: string;

  @Column({ nullable: true })
  repository_id: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: "master" })
  main_branch: string;

  @Column({
    type: "enum",
    enum: RepositoryStatus,
    default: RepositoryStatus.REGISTERED,
  })
  status: RepositoryStatus;

  @Column({ nullable: true })
  last_sync_at: Date;

  @Column({ default: false })
  is_active: boolean;

  @Column({ nullable: true })
  error_message: string;

  @Column({ nullable: true })
  vectorstore_collection: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
