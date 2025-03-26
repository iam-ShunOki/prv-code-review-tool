import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Review } from "./Review";
import { Feedback } from "./Feedback";
import { Evaluation } from "./Evaluation";
import { CodeEmbedding } from "./CodeEmbedding";

export enum SubmissionStatus {
  SUBMITTED = "submitted",
  REVIEWED = "reviewed",
  REVISED = "revised",
}

@Entity("code_submissions")
export class CodeSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  review_id: number;

  @Column({ type: "text" })
  code_content: string;

  @Column({ type: "text", nullable: true })
  expectation: string;

  @Column({
    type: "enum",
    enum: SubmissionStatus,
    default: SubmissionStatus.SUBMITTED,
  })
  status: SubmissionStatus;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Review, (review) => review.submissions)
  @JoinColumn({ name: "review_id" })
  review: Review;

  @OneToMany(() => Feedback, (feedback) => feedback.submission)
  feedbacks: Feedback[];

  @OneToMany(() => Evaluation, (evaluation) => evaluation.submission)
  evaluations: Evaluation[];

  @OneToMany(() => CodeEmbedding, (embedding) => embedding.submission)
  embeddings: CodeEmbedding[];
}
