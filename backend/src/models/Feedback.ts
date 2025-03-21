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

export enum FeedbackPriority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
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

  @Column({
    type: "enum",
    enum: FeedbackPriority,
    default: FeedbackPriority.MEDIUM,
  })
  priority: FeedbackPriority;

  // line_numberフィールドを削除

  @Column({ default: false })
  is_resolved: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => CodeSubmission, (submission) => submission.feedbacks)
  @JoinColumn({ name: "submission_id" })
  submission: CodeSubmission;
}
