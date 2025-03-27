// backend/src/services/BacklogRepositoryService.ts
import { AppDataSource } from "../index";
import {
  BacklogRepository,
  RepositoryStatus,
} from "../models/BacklogRepository";
import { BacklogService } from "./BacklogService";
import { RepositoryVectorSearchService } from "./RepositoryVectorSearchService";
import { In } from "typeorm";

export class BacklogRepositoryService {
  private backlogRepositoryRepository =
    AppDataSource.getRepository(BacklogRepository);
  private backlogService: BacklogService;
  private vectorSearchService: RepositoryVectorSearchService;

  constructor() {
    this.backlogService = new BacklogService();
    this.vectorSearchService = new RepositoryVectorSearchService();
  }

  /**
   * すべてのリポジトリを取得
   */
  async getRepositories(): Promise<BacklogRepository[]> {
    console.log("リポジトリ一覧を取得します");
    return this.backlogRepositoryRepository.find({
      order: {
        updated_at: "DESC",
      },
    });
  }

  /**
   * IDによるリポジトリ取得
   */
  async getRepositoryById(id: number): Promise<BacklogRepository | null> {
    console.log(`リポジトリ #${id} の詳細を取得します`);
    return this.backlogRepositoryRepository.findOne({
      where: { id },
    });
  }

  /**
   * 新規リポジトリを登録
   */
  async registerRepository(data: {
    project_key: string;
    project_name: string;
    repository_name: string;
    repository_id?: string;
    description?: string;
    main_branch?: string;
  }): Promise<BacklogRepository> {
    console.log(
      `新規リポジトリを登録: ${data.project_key}/${data.repository_name}`
    );

    // 既存のリポジトリがないか確認
    const existingRepository = await this.backlogRepositoryRepository.findOne({
      where: {
        project_key: data.project_key,
        repository_name: data.repository_name,
      },
    });

    if (existingRepository) {
      console.log("リポジトリが既に存在します");
      throw new Error(
        `リポジトリ ${data.project_key}/${data.repository_name} は既に登録されています`
      );
    }

    // ベクトルストア用のコレクション名を生成
    const collectionName =
      `backlog_${data.project_key}_${data.repository_name}`.replace(
        /[^a-zA-Z0-9_]/g,
        "_"
      );

    // リポジトリデータの作成
    const repository = this.backlogRepositoryRepository.create({
      project_key: data.project_key,
      project_name: data.project_name,
      repository_name: data.repository_name,
      repository_id: data.repository_id || null,
      description: data.description || null,
      main_branch: data.main_branch || "master",
      status: RepositoryStatus.REGISTERED,
      is_active: true,
      vectorstore_collection: collectionName,
    });

    // データベースに保存
    return this.backlogRepositoryRepository.save(repository);
  }

  /**
   * リポジトリ情報を更新
   */
  async updateRepository(
    id: number,
    data: Partial<BacklogRepository>
  ): Promise<BacklogRepository | null> {
    console.log(`リポジトリ #${id} の情報を更新します`);

    // 更新対象のリポジトリを取得
    const repository = await this.getRepositoryById(id);
    if (!repository) {
      console.log(`リポジトリ #${id} は見つかりませんでした`);
      return null;
    }

    // 更新可能なフィールドをマージ
    const updatableFields = [
      "project_name",
      "repository_name",
      "repository_id",
      "description",
      "main_branch",
      "is_active",
      "status",
    ];

    // フィールドごとに更新
    updatableFields.forEach((field) => {
      if (field in data) {
        (repository as any)[field] = (data as any)[field];
      }
    });

    // 保存して返す
    return this.backlogRepositoryRepository.save(repository);
  }

  /**
   * リポジトリを削除
   */
  async deleteRepository(id: number): Promise<boolean> {
    console.log(`リポジトリ #${id} を削除します`);

    try {
      const result = await this.backlogRepositoryRepository.delete(id);
      return (
        result.affected !== undefined &&
        result.affected !== null &&
        result.affected > 0
      );
    } catch (error) {
      console.error(`リポジトリ #${id} の削除中にエラーが発生しました:`, error);
      return false;
    }
  }

  /**
   * リポジトリをクローンしてベクトル化
   */
  async cloneAndVectorizeRepository(id: number): Promise<string | null> {
    console.log(`リポジトリ #${id} をクローンしてベクトル化します`);

    try {
      // リポジトリ情報を取得
      const repository = await this.getRepositoryById(id);
      if (!repository) {
        console.log(`リポジトリ #${id} は見つかりませんでした`);
        return null;
      }

      // ステータスを更新
      repository.status = RepositoryStatus.CLONED;
      await this.backlogRepositoryRepository.save(repository);

      // ベクトル化を実行
      const collectionName = await this.vectorSearchService.vectorizeRepository(
        repository.project_key,
        repository.repository_name,
        repository.main_branch
      );

      // 成功したらステータスを更新
      repository.status = RepositoryStatus.VECTORIZED;
      repository.vectorstore_collection = collectionName;
      repository.last_vectorized_at = new Date();
      repository.error_message = null;
      await this.backlogRepositoryRepository.save(repository);

      console.log(`リポジトリ #${id} のベクトル化が完了しました`);
      return collectionName;
    } catch (error: any) {
      console.error(
        `リポジトリ #${id} のベクトル化中にエラーが発生しました:`,
        error
      );

      // エラー時はステータスを更新
      try {
        const repository = await this.getRepositoryById(id);
        if (repository) {
          repository.status = RepositoryStatus.FAILED;
          repository.error_message =
            error.message || "ベクトル化に失敗しました";
          await this.backlogRepositoryRepository.save(repository);
        }
      } catch (updateError) {
        console.error(
          `エラー状態の更新中にさらにエラーが発生しました:`,
          updateError
        );
      }

      return null;
    }
  }

  /**
   * プロジェクトキーとリポジトリ名でリポジトリを検索
   */
  async findByProjectAndRepoName(
    projectKey: string,
    repoName: string
  ): Promise<BacklogRepository | null> {
    console.log(`リポジトリを検索: ${projectKey}/${repoName}`);
    return this.backlogRepositoryRepository.findOne({
      where: {
        project_key: projectKey,
        repository_name: repoName,
      },
    });
  }

  /**
   * アクティブなリポジトリのみを取得
   */
  async getActiveRepositories(): Promise<BacklogRepository[]> {
    console.log("アクティブなリポジトリ一覧を取得します");
    return this.backlogRepositoryRepository.find({
      where: { is_active: true },
      order: {
        project_key: "ASC",
        repository_name: "ASC",
      },
    });
  }

  /**
   * ベクトル化されたリポジトリのみを取得
   */
  async getVectorizedRepositories(): Promise<BacklogRepository[]> {
    console.log("ベクトル化済みリポジトリ一覧を取得します");
    return this.backlogRepositoryRepository.find({
      where: {
        status: RepositoryStatus.VECTORIZED,
        is_active: true,
      },
      order: {
        project_key: "ASC",
        repository_name: "ASC",
      },
    });
  }
}
