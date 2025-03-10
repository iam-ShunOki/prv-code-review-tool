import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CodeSubmission } from './CodeSubmission';

@Entity('code_embeddings')
export class CodeEmbedding {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  submission_id: number;

  @Column()
  embedding_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => CodeSubmission, submission => submission.embeddings)
  @JoinColumn({ name: 'submission_id' })
  submission: CodeSubmission;
}