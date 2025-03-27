// backend/src/services/BacklogRepositoryService.ts
import { AppDataSource } from "../index";
import {
  BacklogRepository,
  RepositoryStatus,
} from "../models/BacklogRepository";
import { BacklogService } from "./BacklogService";
import { RepositoryVectorSearchService } from "./RepositoryVectorSearchService";

export class BacklogRepositoryService {
  private backlogRepositoryRepository =
    AppDataSource.getRepository(BacklogRepository);
  private backlogService: BacklogService;
  private repositoryVectorService: RepositoryVectorSearchService;

  constructor() {
    this.backlogService = new BacklogService();
    this.repositoryVectorService = new RepositoryVectorSearchService();
  }

  /**
   * リポジトリ情報を取得
   */
  async getRepositoryById(id: number): Promise<BacklogRepository | null> {
    try {
      console.log(`リポジトリ情報取得: ID ${id}`);

      const repository = await this.backlogRepositoryRepository.findOneBy({
        id,
      });

      if (!repository) {
        console.log(`リポジトリID ${id} が見つかりません`);
        return null;
      }

      return repository;
    } catch (error) {
      console.error(`リポジトリ情報取得エラー (ID ${id}):`, error);
      throw error;
    }
  }

  /**
   * プロジェクトとリポジトリ名からリポジトリ情報を取得
   */
  async getRepositoryByProjectAndName(
    projectKey: string,
    repositoryName: string
  ): Promise<BacklogRepository | null> {
    try {
      console.log(`リポジトリ情報取得: ${projectKey}/${repositoryName}`);

      const repository = await this.backlogRepositoryRepository.findOne({
        where: {
          project_key: projectKey,
          repository_name: repositoryName,
          is_active: true,
        },
      });

      if (!repository) {
        console.log(
          `リポジトリ ${projectKey}/${repositoryName} が見つかりません`
        );
        return null;
      }

      return repository;
    } catch (error) {
      console.error(
        `リポジトリ情報取得エラー (${projectKey}/${repositoryName}):`,
        error
      );
      throw error;
    }
  }

  /**
   * リポジトリのステータスを更新
   */
  async updateRepositoryStatus(
    repositoryId: number,
    status: RepositoryStatus,
    errorMessage?: string
  ): Promise<BacklogRepository> {
    try {
      console.log(
        `リポジトリステータス更新: ID ${repositoryId}, ステータス ${status}`
      );

      const repository = await this.getRepositoryById(repositoryId);
      if (!repository) {
        throw new Error(`リポジトリID ${repositoryId} が見つかりません`);
      }

      // ステータスを更新
      repository.status = status;

      // エラーメッセージが指定されている場合は設定
      if (errorMessage) {
        repository.error_message = errorMessage;
      }

      // 更新して返却
      const updatedRepository = await this.backlogRepositoryRepository.save(
        repository
      );

      return updatedRepository;
    } catch (error) {
      console.error(
        `リポジトリステータス更新エラー (ID ${repositoryId}):`,
        error
      );
      throw error;
    }
  }

  /**
   * 登録済みリポジトリのリスト取得
   */
  async getActiveRepositories(): Promise<BacklogRepository[]> {
    try {
      console.log(`アクティブなリポジトリ一覧を取得`);

      const repositories = await this.backlogRepositoryRepository.find({
        where: { is_active: true },
        order: { updated_at: "DESC" },
      });

      console.log(
        `${repositories.length}件のアクティブリポジトリが見つかりました`
      );

      return repositories;
    } catch (error) {
      console.error(`アクティブリポジトリ一覧取得エラー:`, error);
      throw error;
    }
  }

  /**
   * リポジトリを登録または更新
   */
  async registerRepository(
    projectKey: string,
    projectName: string,
    repositoryName: string,
    repositoryId: string | null = null,
    mainBranch: string = "master"
  ): Promise<BacklogRepository> {
    try {
      console.log(`リポジトリ登録/更新: ${projectKey}/${repositoryName}`);

      // 既存リポジトリの確認
      let repository = await this.getRepositoryByProjectAndName(
        projectKey,
        repositoryName
      );

      if (repository) {
        // 既存リポジトリの更新
        repository.project_name = projectName;
        repository.repository_id = repositoryId;
        repository.main_branch = mainBranch;
        repository.is_active = true;

        // 更新して返却
        const updatedRepository = await this.backlogRepositoryRepository.save(
          repository
        );
        console.log(`既存リポジトリを更新: ID ${updatedRepository.id}`);

        return updatedRepository;
      } else {
        // 新規リポジトリの作成
        const newRepositoryData = {
          project_key: projectKey,
          project_name: projectName,
          repository_name: repositoryName,
          repository_id: repositoryId,
          main_branch: mainBranch,
          status: RepositoryStatus.REGISTERED,
          is_active: true,
          vectorstore_collection:
            `backlog_${projectKey}_${repositoryName}`.replace(
              /[^a-zA-Z0-9_]/g,
              "_"
            ),
        };

        const newRepository =
          this.backlogRepositoryRepository.create(newRepositoryData);
        const savedRepository = await this.backlogRepositoryRepository.save(
          newRepository
        );

        console.log(`新規リポジトリを登録: ID ${savedRepository.id}`);

        return savedRepository;
      }
    } catch (error) {
      console.error(
        `リポジトリ登録/更新エラー (${projectKey}/${repositoryName}):`,
        error
      );
      throw error;
    }
  }

  /**
   * リポジトリを同期
   */
  async syncRepositories(): Promise<BacklogRepository[]> {
    try {
      console.log(`リポジトリ同期開始`);

      // Backlogからプロジェクト一覧を取得
      const projects = await this.backlogService.getProjects();

      const updatedRepositories: BacklogRepository[] = [];

      // 各プロジェクトのリポジトリを処理
      for (const project of projects) {
        try {
          // プロジェクトのリポジトリ一覧を取得
          const repositories = await this.backlogService.getRepositories(
            project.projectKey
          );

          for (const repo of repositories) {
            try {
              // リポジトリを登録または更新
              const updatedRepo = await this.registerRepository(
                project.projectKey,
                project.name,
                repo.name,
                repo.id.toString(),
                repo.defaultBranch || "master"
              );

              updatedRepositories.push(updatedRepo);
            } catch (repoError) {
              console.error(
                `リポジトリ登録エラー (${project.projectKey}/${repo.name}):`,
                repoError
              );

              // エラー情報を保存
              const errorMessage =
                repoError instanceof Error
                  ? repoError.message
                  : String(repoError);

              // 既存リポジトリの確認
              const existingRepo = await this.getRepositoryByProjectAndName(
                project.projectKey,
                repo.name
              );

              if (existingRepo) {
                // エラー情報を更新
                await this.updateRepositoryStatus(
                  existingRepo.id,
                  RepositoryStatus.FAILED,
                  errorMessage
                );
              }
            }
          }
        } catch (projectError) {
          console.error(
            `プロジェクト処理エラー (${project.projectKey}):`,
            projectError
          );
        }
      }

      console.log(`${updatedRepositories.length}件のリポジトリを同期しました`);

      return updatedRepositories;
    } catch (error) {
      console.error(`リポジトリ同期エラー:`, error);
      throw error;
    }
  }

  /**
   * リポジトリを削除（論理削除）
   */
  async deleteRepository(id: number): Promise<boolean> {
    try {
      console.log(`リポジトリ削除: ID ${id}`);

      const repository = await this.getRepositoryById(id);
      if (!repository) {
        throw new Error(`リポジトリID ${id} が見つかりません`);
      }

      // 論理削除（非アクティブに設定）
      repository.is_active = false;

      await this.backlogRepositoryRepository.save(repository);

      console.log(`リポジトリを削除しました: ID ${id}`);

      return true;
    } catch (error) {
      console.error(`リポジトリ削除エラー (ID ${id}):`, error);
      return false;
    }
  }

  /**
   * リポジトリの自動ベクトル化処理
   */
  async vectorizeRepositories(limit: number = 5): Promise<BacklogRepository[]> {
    try {
      console.log(`リポジトリの自動ベクトル化処理開始（上限 ${limit}件）`);

      // ベクトル化対象のリポジトリを取得
      const repositories = await this.backlogRepositoryRepository.find({
        where: {
          is_active: true,
          status: RepositoryStatus.REGISTERED,
        },
        order: { created_at: "ASC" },
        take: limit,
      });

      console.log(
        `${repositories.length}件のベクトル化対象リポジトリが見つかりました`
      );

      const vectorizedRepositories: BacklogRepository[] = [];

      // 各リポジトリのベクトル化を実行
      for (const repository of repositories) {
        try {
          console.log(
            `リポジトリのベクトル化開始: ${repository.project_key}/${repository.repository_name}`
          );

          // ステータスをクローン中に更新
          await this.updateRepositoryStatus(
            repository.id,
            RepositoryStatus.CLONED
          );

          // ベクトル化処理
          const collectionName =
            await this.repositoryVectorService.vectorizeRepository(
              repository.project_key,
              repository.repository_name,
              repository.main_branch
            );

          // ベクトル化成功時の更新
          const updatedRepo = await this.backlogRepositoryRepository.findOneBy({
            id: repository.id,
          });
          if (updatedRepo) {
            updatedRepo.status = RepositoryStatus.VECTORIZED;
            updatedRepo.vectorstore_collection = collectionName;
            updatedRepo.last_vectorized_at = new Date();
            updatedRepo.error_message = null;

            const savedRepo = await this.backlogRepositoryRepository.save(
              updatedRepo
            );
            vectorizedRepositories.push(savedRepo);

            console.log(
              `リポジトリのベクトル化完了: ${repository.project_key}/${repository.repository_name}`
            );
          }
        } catch (error) {
          console.error(
            `リポジトリのベクトル化エラー (ID ${repository.id}):`,
            error
          );

          // エラー情報を更新
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          await this.updateRepositoryStatus(
            repository.id,
            RepositoryStatus.FAILED,
            errorMessage
          );
        }
      }

      console.log(
        `${vectorizedRepositories.length}件のリポジトリをベクトル化しました`
      );

      return vectorizedRepositories;
    } catch (error) {
      console.error(`リポジトリベクトル化処理エラー:`, error);
      throw error;
    }
  }
}
