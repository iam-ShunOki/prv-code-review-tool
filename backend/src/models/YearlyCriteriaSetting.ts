// backend/src/models/YearlyCriteriaSetting.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { EvaluationCriteria } from "./EvaluationCriteria";

@Entity("yearly_criteria_settings")
export class YearlyCriteriaSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  criteria_id: number;

  @Column()
  academic_year: number;

  @Column({ type: "float", default: 1.0 })
  weight: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // リレーションシップ
  @ManyToOne(() => EvaluationCriteria, (criteria) => criteria.yearlySettings)
  @JoinColumn({ name: "criteria_id" })
  criteria: EvaluationCriteria;
}
