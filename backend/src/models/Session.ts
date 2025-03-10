import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";

@Entity("sessions")
export class Session {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  session_token: string;

  @Column()
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: "user_id" })
  user: User;
}
