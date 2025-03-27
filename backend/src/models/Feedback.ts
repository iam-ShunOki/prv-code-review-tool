// backend/src/models/Feedback.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CodeSubmission } from "./CodeSubmission";
import { User } from "./User";

export enum FeedbackPriority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

// フィードバックカテゴリの定義
export enum FeedbackCategory {
  CODE_QUALITY = "code_quality", // コード品質
  SECURITY = "security", // セキュリティ
  PERFORMANCE = "performance", // パフォーマンス
  BEST_PRACTICE = "best_practice", // ベストプラクティス
  READABILITY = "readability", // 可読性
  FUNCTIONALITY = "functionality", // 機能性
  MAINTAINABILITY = "maintainability", // 保守性
  ARCHITECTURE = "architecture", // アーキテクチャ
  OTHER = "other", // その他
}

@Entity("feedback")
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  submission_id: number;

  @Column({ type: "text" })
  problem_point: string;

  @Column({ type: "text" })
  suggestion: string;

  @Column({ type: "text", nullable: true })
  reference_url: string;

  @Column({ type: "text", nullable: true })
  code_snippet: string; // 問題のあるコードスニペット

  @Column({
    type: "enum",
    enum: FeedbackPriority,
    default: FeedbackPriority.MEDIUM,
  })
  priority: FeedbackPriority;

  // 解決済みフラグ（既存）
  @Column({ default: false })
  is_resolved: boolean;

  // 以下、チェックリスト関連のフィールドを追加

  // フィードバックカテゴリ
  @Column({
    type: "enum",
    enum: FeedbackCategory,
    nullable: true,
    comment: "フィードバックのカテゴリ",
  })
  category: FeedbackCategory;

  // チェック状態フラグ
  @Column({
    default: false,
    comment: "チェックリストでチェック済みかどうか",
  })
  is_checked: boolean;

  // チェックされた日時
  @Column({
    type: "timestamp",
    nullable: true,
    comment: "チェックされた日時",
  })
  checked_at: Date;

  // チェックを行ったユーザーID
  @Column({
    nullable: true,
    comment: "チェックを行ったユーザーID",
  })
  checked_by: number;

  // チェックを行ったユーザーとの関連
  @ManyToOne(() => User)
  @JoinColumn({ name: "checked_by" })
  checker: User;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => CodeSubmission, (submission) => submission.feedbacks)
  @JoinColumn({ name: "submission_id" })
  submission: CodeSubmission;
}
