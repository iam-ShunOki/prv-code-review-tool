// backend/src/models/UserProject.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Project } from "./Project";

export enum UserProjectRole {
  LEADER = "leader",
  MEMBER = "member",
  REVIEWER = "reviewer",
  OBSERVER = "observer",
}

@Entity("user_projects")
export class UserProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  project_id: number;

  @Column({
    type: "enum",
    enum: UserProjectRole,
    default: UserProjectRole.MEMBER,
  })
  role: UserProjectRole;

  @CreateDateColumn()
  joined_at: Date;

  @ManyToOne(() => User, (user) => user.userProjects)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Project, (project) => project.userProjects)
  @JoinColumn({ name: "project_id" })
  project: Project;
}
