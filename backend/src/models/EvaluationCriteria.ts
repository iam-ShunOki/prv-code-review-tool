// backend/src/models/EvaluationCriteria.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("evaluation_criteria")
export class EvaluationCriteria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, name: "criteria_key" }) // keyからcriteria_keyに変更
  key: string; // プロパティ名はkeyのままでもOK（エンティティ内でのみの使用なので）

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
}
