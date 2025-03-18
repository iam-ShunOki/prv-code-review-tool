// backend/src/services/BacklogRepositoryService.ts
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { exec } from "child_process";
import { AppDataSource } from "../index";
import { BacklogService } from "./BacklogService";
import { CodeEmbeddingService } from "./CodeEmbeddingService";
import {
  BacklogRepository,
  RepositoryStatus,
} from "../models/BacklogRepository";
import { glob } from "glob";

const execPromise = promisify(exec);
const mkdirPromise = promisify(fs.mkdir);
const unlinkPromise = promisify(fs.unlink);
const rmdirPromise = promisify(fs.rmdir);
const readFilePromise = promisify(fs.readFile);

export class BacklogRepositoryService {
  private repositoryRepository = AppDataSource.getRepository(BacklogRepository);
  private backlogService: BacklogService;
  private codeEmbeddingService: CodeEmbeddingService;
  private tempDir: string;

  constructor() {
    this.backlogService = new BacklogService();
    this.codeEmbeddingService = new CodeEmbeddingService();
    this.tempDir = path.join(__dirname, "../../temp/repositories");
    this.ensureTempDir();
  }

  /**
   * 一時ディレクトリが存在することを確認
   */
  private async ensureTempDir(): Promise<void> {
    if (!fs.existsSync(this.tempDir)) {
      await mkdirPromise(this.tempDir, { recursive: true });
    }
  }

  /**
   * リポジトリを登録
   */
  async registerRepository(data: {
    project_key: string;
    project_name: string;
    repository_name: string;
    repository_id?: string;
    description?: string;
    main_branch?: string;
  }): Promise<BacklogRepository> {
    // 既存のリポジトリをチェック
    const existingRepo = await this.repositoryRepository.findOne({
      where: {
        project_key: data.project_key,
        repository_name: data.repository_name,
      },
    });

    if (existingRepo) {
      // 既に削除されていたリポジトリの場合は再有効化
      if (!existingRepo.is_active) {
        console.log(`Re-activating existing repository ${existingRepo.id}`);
        existingRepo.is_active = true;
        existingRepo.status = RepositoryStatus.REGISTERED;
        existingRepo.error_message = "";
        return this.repositoryRepository.save(existingRepo);
      }
      // アクティブなリポジトリの場合は更新
      console.log(`Updating existing repository ${existingRepo.id}`);
      existingRepo.project_name = data.project_name;
      existingRepo.description = data.description || existingRepo.description;
      existingRepo.main_branch = data.main_branch || existingRepo.main_branch;
      existingRepo.repository_id =
        data.repository_id || existingRepo.repository_id;

      return this.repositoryRepository.save(existingRepo);
    }

    // 新しいリポジトリを作成
    console.log(
      `Creating new repository record for ${data.project_key}/${data.repository_name}`
    );
    const repository = this.repositoryRepository.create({
      project_key: data.project_key,
      project_name: data.project_name,
      repository_name: data.repository_name,
      repository_id: data.repository_id,
      description: data.description,
      main_branch: data.main_branch || "master",
      status: RepositoryStatus.REGISTERED,
      is_active: true,
      vectorstore_collection:
        `backlog_${data.project_key}_${data.repository_name}`.replace(
          /[^a-zA-Z0-9_]/g,
          "_"
        ),
    });

    // リポジトリをデータベースに保存
    const savedRepository = await this.repositoryRepository.save(repository);
    console.log(`Repository saved with ID ${savedRepository.id}`);

    // バックグラウンドでベクトル化処理を開始
    setTimeout(() => {
      console.log(
        `Scheduling background vectorization for repository ${savedRepository.id}`
      );
      this.cloneAndVectorizeRepository(savedRepository.id)
        .then(() =>
          console.log(
            `Background vectorization completed for repository ${savedRepository.id}`
          )
        )
        .catch((error) =>
          console.error(
            `Background vectorization error for repository ${savedRepository.id}:`,
            error
          )
        );
    }, 2000);

    return savedRepository;
  }

  /**
   * バックグラウンドでベクトル化処理を開始
   */
  private async triggerBackgroundVectorization(
    repositoryId: number
  ): Promise<void> {
    try {
      console.log(
        `Starting background vectorization for repository ${repositoryId}`
      );

      // 少し遅延を入れてシステムの負荷を分散
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ベクトル化実行
      await this.cloneAndVectorizeRepository(repositoryId);

      console.log(
        `Background vectorization completed for repository ${repositoryId}`
      );
    } catch (error) {
      console.error(
        `Background vectorization failed for repository ${repositoryId}:`,
        error
      );

      // エラー情報をリポジトリに記録
      try {
        await this.updateRepository(repositoryId, {
          status: RepositoryStatus.FAILED,
          error_message: error instanceof Error ? error.message : String(error),
        });
      } catch (updateError) {
        console.error(`Failed to update repository status:`, updateError);
      }
    }
  }

  /**
   * 登録されたリポジトリ一覧を取得
   */
  async getRepositories(): Promise<BacklogRepository[]> {
    return this.repositoryRepository.find({
      where: { is_active: true },
      order: { updated_at: "DESC" },
    });
  }

  /**
   * 特定のリポジトリ情報を取得
   */
  async getRepositoryById(id: number): Promise<BacklogRepository | null> {
    return this.repositoryRepository.findOne({
      where: { id, is_active: true },
    });
  }

  /**
   * プロジェクトキーとリポジトリ名からリポジトリ情報を取得
   */
  async getRepositoryByDetails(
    projectKey: string,
    repositoryName: string
  ): Promise<BacklogRepository | null> {
    return this.repositoryRepository.findOne({
      where: {
        project_key: projectKey,
        repository_name: repositoryName,
        is_active: true,
      },
    });
  }

  /**
   * リポジトリ情報を更新
   */
  async updateRepository(
    id: number,
    data: Partial<BacklogRepository>
  ): Promise<BacklogRepository | null> {
    await this.repositoryRepository.update(id, data);
    return this.getRepositoryById(id);
  }

  /**
   * リポジトリを論理削除
   */
  async deleteRepository(id: number): Promise<boolean> {
    const repository = await this.getRepositoryById(id);
    if (!repository) {
      return false;
    }

    // 論理削除のみ実行（物理削除はしない）
    repository.is_active = false;
    await this.repositoryRepository.save(repository);
    return true;
  }

  /**
   * リポジトリのクローンとベクトル化を実行
   */
  async cloneAndVectorizeRepository(id: number): Promise<BacklogRepository> {
    const repository = await this.getRepositoryById(id);
    if (!repository) {
      throw new Error("リポジトリが見つかりません");
    }

    let tempRepoDir = "";

    try {
      // ステータスを更新
      await this.updateRepository(id, { status: RepositoryStatus.CLONED });

      // リポジトリをクローン
      tempRepoDir = await this.cloneRepository(
        repository.project_key,
        repository.repository_name,
        repository.main_branch
      );

      // ベクトル化対象のファイルパスを取得
      const filePaths = await this.getCodeFilePaths(tempRepoDir);

      if (filePaths.length === 0) {
        throw new Error("ベクトル化対象のコードファイルが見つかりません");
      }

      // コードファイルをベクトル化
      await this.vectorizeFiles(
        repository.vectorstore_collection,
        tempRepoDir,
        filePaths
      );

      // 正常にベクトル化が完了した場合、ステータスを更新
      await this.updateRepository(id, {
        status: RepositoryStatus.VECTORIZED,
        last_sync_at: new Date(),
        error_message: "",
      });

      return (await this.getRepositoryById(id)) as BacklogRepository;
    } catch (error) {
      console.error(`リポジトリ処理エラー (ID: ${id}):`, error);

      // エラー情報を記録
      await this.updateRepository(id, {
        status: RepositoryStatus.FAILED,
        error_message: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    } finally {
      // 一時ディレクトリの削除
      await this.cleanupTempDir(tempRepoDir);
    }
  }

  /**
   * リポジトリをクローン
   */
  private async cloneRepository(
    projectKey: string,
    repoName: string,
    branch: string = "master"
  ): Promise<string> {
    const tempRepoDir = path.join(
      this.tempDir,
      `${projectKey}_${repoName}_${Date.now()}`
    );

    try {
      // 一時ディレクトリを作成
      await mkdirPromise(tempRepoDir, { recursive: true });

      // Backlogのギットリポジトリへのアクセス情報を取得
      const spaceKey = process.env.BACKLOG_SPACE || "";
      const apiKey = process.env.BACKLOG_API_KEY || "";

      // アクセス情報で認証用URLを構築
      // const gitUrl = `https://${spaceKey}.backlog.jp/git/${projectKey}/${repoName}.git`;
      const gitUrl = `${spaceKey}@${spaceKey}.git.backlog.jp:/${projectKey}/${repoName}.git`;

      // クローンコマンドを実行
      const command = `git clone -b ${branch} ${gitUrl} ${tempRepoDir}`;
      await execPromise(command);

      return tempRepoDir;
    } catch (error) {
      // エラーが発生した場合、作成した一時ディレクトリを削除
      if (fs.existsSync(tempRepoDir)) {
        await rmdirPromise(tempRepoDir, { recursive: true });
      }
      throw error;
    }
  }

  /**
   * ベクトル化対象のコードファイルパスを取得
   */
  private async getCodeFilePaths(repoDir: string): Promise<string[]> {
    // サポートするコード拡張子
    const extensions = [
      // プログラミング言語
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "rb",
      "php",
      "c",
      "cpp",
      "cs",
      "go",
      "rs",
      "swift",
      "kt",
      "scala",
      "sh",
      "bash",
      "pl",
      "r",
      "sql",
      "html",
      "css",
      "scss",
      "sass",
      "less",
      // 設定ファイル
      "json",
      "yaml",
      "yml",
      "xml",
      "toml",
      "ini",
      "conf",
      "config",
      // 文書ファイル
      "md",
      "markdown",
      "txt",
    ];

    // 除外するパターン
    const excludeDirs = [
      "**/node_modules/**",
      "**/venv/**",
      "**/.git/**",
      "**/build/**",
      "**/dist/**",
      "**/target/**",
    ];

    // ファイルのグロブパターンを構築
    const pattern = `**/*.@(${extensions.join("|")})`;

    // ファイルパスを取得（glob v10以降はネイティブにPromiseをサポート）
    const files = await glob(pattern, {
      cwd: repoDir,
      ignore: excludeDirs,
      absolute: true,
    });

    return files;
  }

  /**
   * ファイルをベクトル化
   */
  private async vectorizeFiles(
    collectionName: string,
    repoDir: string,
    filePaths: string[]
  ): Promise<void> {
    // テキストファイルのみを処理対象とする
    const textFiles = filePaths.filter((filePath) => {
      const stats = fs.statSync(filePath);
      // 50MBを超えるファイルは除外
      return stats.isFile() && stats.size < 50 * 1024 * 1024;
    });

    // 各ファイルをベクトル化
    for (const filePath of textFiles) {
      try {
        // ファイルの内容を読み込む
        const content = await readFilePromise(filePath, "utf-8");

        // 相対パスを取得（メタデータとして保存）
        const relativePath = path.relative(repoDir, filePath);

        // ファイルの拡張子を取得
        const extension = path.extname(filePath).substring(1);

        // ベクトル化を実行
        await this.codeEmbeddingService.createEmbeddingFromCode(
          content,
          collectionName,
          {
            filePath: relativePath,
            fileType: extension,
            repoDir: path.basename(repoDir),
          }
        );
      } catch (error) {
        console.error(`ファイルのベクトル化エラー (${filePath}):`, error);
        // エラーがあっても処理を続行
      }
    }
  }

  /**
   * 一時ディレクトリを削除
   */
  private async cleanupTempDir(dirPath: string): Promise<void> {
    if (dirPath && fs.existsSync(dirPath)) {
      try {
        await rmdirPromise(dirPath, { recursive: true });
        console.log(`一時ディレクトリを削除しました: ${dirPath}`);
      } catch (error) {
        console.error(`一時ディレクトリの削除エラー (${dirPath}):`, error);
      }
    }
  }
}
