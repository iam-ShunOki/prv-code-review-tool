// backend/src/services/UserGroupService.ts - 修正版
import { AppDataSource } from "../index";
import { UserGroup } from "../models/UserGroup";
import { UserGroupMember, GroupMemberRole } from "../models/UserGroupMember";
import { User } from "../models/User";
import { In } from "typeorm";

export class UserGroupService {
  private groupRepository = AppDataSource.getRepository(UserGroup);
  private groupMemberRepository = AppDataSource.getRepository(UserGroupMember);
  private userRepository = AppDataSource.getRepository(User);

  /**
   * グループを作成する
   */
  async createGroup(data: {
    name: string;
    description?: string;
    creatorId?: number;
  }): Promise<UserGroup> {
    // グループの作成
    const group = this.groupRepository.create({
      name: data.name,
      description: data.description,
      is_active: true,
    });

    // グループを保存
    const savedGroup = await this.groupRepository.save(group);

    // 作成者をマネージャーとして追加（オプション）
    if (data.creatorId) {
      await this.addGroupMember(
        savedGroup.id,
        data.creatorId,
        GroupMemberRole.MANAGER
      );
    }

    return savedGroup;
  }

  /**
   * 全てのグループを取得する
   */
  async getAllGroups(): Promise<UserGroup[]> {
    return this.groupRepository.find({
      where: { is_active: true },
      order: {
        created_at: "DESC",
      },
    });
  }

  /**
   * 特定のユーザーが所属するグループを取得
   */
  async getUserGroups(userId: number): Promise<UserGroup[]> {
    const memberships = await this.groupMemberRepository.find({
      where: { user_id: userId },
      relations: ["group"],
    });

    return memberships
      .map((membership) => membership.group)
      .filter((group) => group.is_active);
  }

  /**
   * グループIDによる取得
   */
  async getGroupById(id: number): Promise<UserGroup | null> {
    return this.groupRepository.findOne({
      where: { id, is_active: true },
    });
  }

  /**
   * グループ情報を更新
   */
  async updateGroup(
    id: number,
    data: Partial<UserGroup>
  ): Promise<UserGroup | null> {
    await this.groupRepository.update(id, data);
    return this.getGroupById(id);
  }

  /**
   * グループを論理削除
   */
  async deleteGroup(id: number): Promise<boolean> {
    const result = await this.groupRepository.update(id, { is_active: false });
    // TypeScript エラーを修正: affected が null の可能性に対応
    return result.affected !== undefined && result.affected > 0;
  }

  /**
   * グループにメンバーを追加
   */
  async addGroupMember(
    groupId: number,
    userId: number,
    role: GroupMemberRole = GroupMemberRole.MEMBER
  ): Promise<UserGroupMember> {
    // ユーザーとグループの存在確認
    const user = await this.userRepository.findOneBy({ id: userId });
    const group = await this.groupRepository.findOneBy({
      id: groupId,
      is_active: true,
    });

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    if (!group) {
      throw new Error("グループが見つかりません");
    }

    // 既に関連が存在するか確認
    const existingMembership = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: userId },
    });

    if (existingMembership) {
      // 既存の関連がある場合は役割を更新
      existingMembership.role = role;
      return this.groupMemberRepository.save(existingMembership);
    }

    // 新規関連の作成
    const membership = this.groupMemberRepository.create({
      group_id: groupId,
      user_id: userId,
      role: role,
    });

    return this.groupMemberRepository.save(membership);
  }

  /**
   * グループからメンバーを削除
   */
  async removeGroupMember(groupId: number, userId: number): Promise<boolean> {
    const result = await this.groupMemberRepository.delete({
      group_id: groupId,
      user_id: userId,
    });
    // TypeScript エラーを修正: affected が null の可能性に対応
    return (
      result.affected !== undefined &&
      result.affected !== null &&
      result.affected > 0
    );
  }

  /**
   * グループメンバーの役割を更新
   */
  async updateMemberRole(
    groupId: number,
    userId: number,
    role: GroupMemberRole
  ): Promise<UserGroupMember | null> {
    const membership = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: userId },
    });

    if (!membership) {
      return null;
    }

    membership.role = role;
    return this.groupMemberRepository.save(membership);
  }

  /**
   * グループのメンバー一覧を取得
   */
  async getGroupMembers(
    groupId: number
  ): Promise<(UserGroupMember & { user: User })[]> {
    return this.groupMemberRepository.find({
      where: { group_id: groupId },
      relations: ["user"],
      order: {
        role: "ASC",
        joined_at: "ASC",
      },
    });
  }

  /**
   * ユーザーのグループ所属を確認
   */
  async isUserInGroup(userId: number, groupId: number): Promise<boolean> {
    const count = await this.groupMemberRepository.count({
      where: { user_id: userId, group_id: groupId },
    });

    return count > 0;
  }

  /**
   * 同じグループに所属するユーザーを取得
   */
  async getUsersInSameGroups(userId: number): Promise<User[]> {
    // ユーザーが所属するグループIDを取得
    const userGroupIds = await this.groupMemberRepository
      .find({
        where: { user_id: userId },
        select: ["group_id"],
      })
      .then((memberships) => memberships.map((m) => m.group_id));

    if (userGroupIds.length === 0) {
      return [];
    }

    // それらのグループに所属する他のユーザーを取得
    const groupMemberships = await this.groupMemberRepository.find({
      where: {
        group_id: In(userGroupIds), // Inオペレータで配列を包む
      },
      relations: ["user"],
    });

    // ユーザー自身を除き、重複を排除
    const userMap = new Map<number, User>();
    groupMemberships.forEach((membership) => {
      if (membership.user_id !== userId) {
        userMap.set(membership.user_id, membership.user);
      }
    });

    return Array.from(userMap.values());
  }
}
