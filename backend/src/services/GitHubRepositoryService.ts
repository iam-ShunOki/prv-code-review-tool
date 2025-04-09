// backend/src/services/GitHubRepositoryService.ts
import { AppDataSource } from "../index";
import { GitHubRepository } from "../models/GitHubRepository";
import { GitHubService } from "./GitHubService";
import { Not, IsNull } from "typeorm";

/**
 * GitHubリポジトリの管理サービス
 */
export class GitHubRepositoryService {
  private githubRepositoryRepository =
    AppDataSource.getRepository(GitHubRepository);
  private githubService: GitHubService;

  constructor() {
    this.githubService = new GitHubService();
  }

  /**
   * 全てのGitHubリポジトリを取得
   */
  async getAllRepositories(): Promise<GitHubRepository[]> {
    console.log("全てのGitHubリポジトリを取得します");
    return this.githubRepositoryRepository.find({
      order: {
        owner: "ASC",
        name: "ASC",
      },
    });
  }

  /**
   * アクティブなGitHubリポジトリを取得
   */
  async getActiveRepositories(): Promise<GitHubRepository[]> {
    console.log("アクティブなGitHubリポジトリを取得します");
    return this.githubRepositoryRepository.find({
      where: {
        is_active: true,
      },
      order: {
        owner: "ASC",
        name: "ASC",
      },
    });
  }

  /**
   * GitHubリポジトリをIDで取得
   */
  async getRepositoryById(id: number): Promise<GitHubRepository | null> {
    console.log(`GitHubリポジトリをIDで取得: ${id}`);
    return this.githubRepositoryRepository.findOne({
      where: { id },
    });
  }

  /**
   * GitHubリポジトリをオーナーとリポジトリ名で取得
   */
  async getRepositoryByOwnerAndName(
    owner: string,
    name: string
  ): Promise<GitHubRepository | null> {
    console.log(`GitHubリポジトリを取得: ${owner}/${name}`);
    return this.githubRepositoryRepository.findOne({
      where: { owner, name },
    });
  }

  /**
   * 新しいGitHubリポジトリを登録
   */
  async createRepository(data: {
    owner: string;
    name: string;
    access_token: string;
    webhook_secret?: string;
    is_active?: boolean;
    allow_auto_review?: boolean;
  }): Promise<GitHubRepository> {
    console.log(`新しいGitHubリポジトリを登録: ${data.owner}/${data.name}`);

    // 既存のリポジトリをチェック
    const existingRepo = await this.getRepositoryByOwnerAndName(
      data.owner,
      data.name
    );
    if (existingRepo) {
      throw new Error(
        `リポジトリ ${data.owner}/${data.name} は既に登録されています`
      );
    }

    // リポジトリの有効性を確認
    try {
      // APIクライアントを初期化
      this.githubService.initializeWithToken(data.access_token);

      // リポジトリ情報を取得して存在確認
      const repoInfo = await this.githubService.getRepositoryInfo(
        data.owner,
        data.name
      );

      if (!repoInfo) {
        throw new Error(
          `リポジトリ ${data.owner}/${data.name} が見つかりません`
        );
      }

      console.log(
        `GitHub APIでリポジトリを確認: ${repoInfo.full_name} (${repoInfo.visibility})`
      );
    } catch (error) {
      console.error(
        `リポジトリ確認エラー (${data.owner}/${data.name}):`,
        error
      );
      throw new Error(
        `リポジトリの確認に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // リポジトリオブジェクトの作成
    const repository = this.githubRepositoryRepository.create({
      owner: data.owner,
      name: data.name,
      access_token: data.access_token,
      webhook_secret: data.webhook_secret || undefined,
      is_active: data.is_active !== undefined ? data.is_active : true,
      allow_auto_review:
        data.allow_auto_review !== undefined ? data.allow_auto_review : true,
    });

    // リポジトリを保存
    return this.githubRepositoryRepository.save(repository);
  }

  /**
   * GitHubリポジトリを更新
   */
  async updateRepository(
    id: number,
    data: {
      access_token?: string;
      webhook_secret?: string;
      is_active?: boolean;
      allow_auto_review?: boolean;
    }
  ): Promise<GitHubRepository | null> {
    console.log(`GitHubリポジトリを更新: ID ${id}`);

    // 既存のリポジトリを取得
    const repository = await this.getRepositoryById(id);
    if (!repository) {
      throw new Error(`ID ${id} のリポジトリが見つかりません`);
    }

    // 更新可能なフィールドを設定
    if (data.access_token !== undefined) {
      repository.access_token = data.access_token;
    }
    if (data.webhook_secret !== undefined) {
      repository.webhook_secret = data.webhook_secret;
    }
    if (data.is_active !== undefined) {
      repository.is_active = data.is_active;
    }
    if (data.allow_auto_review !== undefined) {
      repository.allow_auto_review = data.allow_auto_review;
    }

    // アクセストークンが変更された場合、有効性をチェック
    if (data.access_token && data.access_token !== repository.access_token) {
      try {
        // APIクライアントを初期化
        this.githubService.initializeWithToken(data.access_token);

        // リポジトリ情報を取得して存在確認
        const repoInfo = await this.githubService.getRepositoryInfo(
          repository.owner,
          repository.name
        );

        if (!repoInfo) {
          throw new Error(
            `リポジトリ ${repository.owner}/${repository.name} が見つかりません`
          );
        }

        console.log(`GitHub APIでリポジトリを確認: ${repoInfo.full_name}`);
      } catch (error) {
        console.error(
          `トークン検証エラー (${repository.owner}/${repository.name}):`,
          error
        );
        throw new Error(
          `アクセストークンの検証に失敗しました: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // リポジトリを保存
    return this.githubRepositoryRepository.save(repository);
  }

  /**
   * GitHubリポジトリを削除
   */
  async deleteRepository(id: number): Promise<boolean> {
    console.log(`GitHubリポジトリを削除: ID ${id}`);

    // 削除結果を取得
    const result = await this.githubRepositoryRepository.delete(id);

    // 影響を受けた行数が0より大きい場合は成功
    return result.affected !== undefined && result.affected! > 0;
  }

  /**
   * アクセストークンを持つ全リポジトリを取得
   */
  async getRepositoriesWithTokens(): Promise<GitHubRepository[]> {
    return this.githubRepositoryRepository.find({
      where: {
        access_token: Not(IsNull()),
        is_active: true,
      },
    });
  }

  /**
   * オーナーに属するリポジトリを取得
   */
  async getRepositoriesByOwner(owner: string): Promise<GitHubRepository[]> {
    return this.githubRepositoryRepository.find({
      where: { owner },
      order: { name: "ASC" },
    });
  }
}
