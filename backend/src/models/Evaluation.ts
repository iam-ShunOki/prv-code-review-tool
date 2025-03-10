import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { CodeSubmission } from './CodeSubmission';

export enum SkillLevel {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E'
}

@Entity('evaluations')
export class Evaluation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  submission_id: number;

  @Column()
  code_quality_score: number;

  @Column()
  readability_score: number;

  @Column()
  efficiency_score: number;

  @Column()
  best_practices_score: number;

  @Column({
    type: 'enum',
    enum: SkillLevel
  })
  overall_level: SkillLevel;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, user => user.evaluations)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => CodeSubmission, submission => submission.evaluations)
  @JoinColumn({ name: 'submission_id' })
  submission: CodeSubmission;
}