import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Review } from "./Review";
import { Evaluation } from "./Evaluation";
import { Session } from "./Session";

export enum UserRole {
  ADMIN = "admin",
  TRAINEE = "trainee",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.TRAINEE,
  })
  role: UserRole;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  join_year: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Review, (review) => review.user)
  reviews: Review[];

  @OneToMany(() => Evaluation, (evaluation) => evaluation.user)
  evaluations: Evaluation[];

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];
}
