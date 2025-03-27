// backend/src/models/BacklogRepository.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

// リポジトリのステータス定義
export enum RepositoryStatus {
  REGISTERED = "registered", // 登録済み
  CLONED = "cloned", // クローン済み
  VECTORIZED = "vectorized", // ベクトル化済み
  FAILED = "failed", // 処理失敗
}

@Entity({ name: "backlog_repositories" })
export class BacklogRepository {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "project_key" })
  project_key: string;

  @Column({ name: "project_name" })
  project_name: string;

  @Column({ name: "repository_name" })
  repository_name: string;

  @Column({ name: "repository_id", nullable: true })
  repository_id: string | null;

  @Column({ name: "main_branch", default: "master" })
  main_branch: string;

  @Column({ name: "description", type: "text", nullable: true })
  description: string | null;

  @Column({
    name: "status",
    type: "enum",
    enum: RepositoryStatus,
    default: RepositoryStatus.REGISTERED,
  })
  status: RepositoryStatus;

  @Column({ name: "last_sync_at", type: "timestamp", nullable: true })
  last_sync_at: Date | null;

  @Column({ name: "is_active", default: true })
  is_active: boolean;

  @Column({ name: "error_message", type: "text", nullable: true })
  error_message: string | null;

  @Column({ name: "vectorstore_collection", nullable: true })
  vectorstore_collection: string | null;

  @Column({ name: "last_vectorized_at", type: "timestamp", nullable: true })
  last_vectorized_at: Date | null;

  @CreateDateColumn({ name: "created_at" })
  created_at: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at: Date;
}
