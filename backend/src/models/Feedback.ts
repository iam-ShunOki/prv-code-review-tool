import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CodeSubmission } from './CodeSubmission';

export enum FeedbackPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  submission_id: number;

  @Column({ type: 'text' })
  problem_point: string;

  @Column({ type: 'text' })
  suggestion: string;

  @Column({
    type: 'enum',
    enum: FeedbackPriority,
    default: FeedbackPriority.MEDIUM
  })
  priority: FeedbackPriority;

  @Column({ nullable: true })
  line_number: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => CodeSubmission, submission => submission.feedbacks)
  @JoinColumn({ name: 'submission_id' })
  submission: CodeSubmission;
}