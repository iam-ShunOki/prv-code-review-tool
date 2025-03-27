// backend/src/models/EvaluationCriteria.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { YearlyCriteriaSetting } from "./YearlyCriteriaSetting";

@Entity("evaluation_criteria")
export class EvaluationCriteria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, name: "criteria_key" })
  key: string;

  @Column()
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: 0 })
  min_score: number;

  @Column({ default: 10 })
  max_score: number;

  @Column({ type: "float", default: 1.0 })
  weight: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: 0 })
  display_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // 年度別設定との関連付け
  @OneToMany(() => YearlyCriteriaSetting, (setting) => setting.criteria)
  yearlySettings: YearlyCriteriaSetting[];
}
