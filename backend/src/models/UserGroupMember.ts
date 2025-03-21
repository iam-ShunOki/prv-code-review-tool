// backend/src/models/UserGroupMember.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { UserGroup } from "./UserGroup";

export enum GroupMemberRole {
  MANAGER = "manager",
  MEMBER = "member",
}

@Entity("user_group_members")
export class UserGroupMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  group_id: number;

  @Column()
  user_id: number;

  @Column({
    type: "enum",
    enum: GroupMemberRole,
    default: GroupMemberRole.MEMBER,
  })
  role: GroupMemberRole;

  @CreateDateColumn()
  joined_at: Date;

  @ManyToOne(() => UserGroup, (group) => group.members)
  @JoinColumn({ name: "group_id" })
  group: UserGroup;

  @ManyToOne(() => User, (user) => user.groupMemberships)
  @JoinColumn({ name: "user_id" })
  user: User;
}
