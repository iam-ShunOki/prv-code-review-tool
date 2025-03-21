import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  // 既存のインポート
} from "typeorm";
import { Review } from "./Review";
import { Evaluation } from "./Evaluation";
import { Session } from "./Session";
// 新しいインポートを追加
import { UserProject } from "./UserProject";
import { UserGroupMember } from "./UserGroupMember";

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

  // 新しいリレーションを追加
  @OneToMany(() => UserProject, (userProject) => userProject.user)
  userProjects: UserProject[];

  @OneToMany(() => UserGroupMember, (membership) => membership.user)
  groupMemberships: UserGroupMember[];
}
