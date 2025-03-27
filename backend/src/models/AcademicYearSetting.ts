// backend/src/models/AcademicYearSetting.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("academic_year_settings")
export class AcademicYearSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  academic_year: number;

  @Column({ length: 100 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: false })
  is_current: boolean;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
