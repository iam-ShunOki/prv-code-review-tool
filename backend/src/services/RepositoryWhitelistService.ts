// backend/src/services/RepositoryWhitelistService.ts
import { AppDataSource } from "../index";
import fs from "fs";
import path from "path";
import { promisify } from "util";

// 設定ファイルのパス
const CONFIG_DIR = path.join(__dirname, "../../config");
const WHITELIST_PATH = path.join(CONFIG_DIR, "repository_whitelist.json");

// プロミスベースのファイル操作
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * ホワイトリストに登録するリポジトリ情報の型
 */
export interface WhitelistedRepository {
  projectKey: string;
  repositoryName: string;
  allowAutoReply: boolean;
  addedAt: string;
  addedBy?: string;
  notes?: string;
}

/**
 * リポジトリのホワイトリストを管理するサービス
 * 自動レビュー返信を許可するリポジトリを制御します
 */
export class RepositoryWhitelistService {
  private static instance: RepositoryWhitelistService;
  private whitelist: WhitelistedRepository[] = [];
  private loaded: boolean = false;

  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): RepositoryWhitelistService {
    if (!RepositoryWhitelistService.instance) {
      RepositoryWhitelistService.instance = new RepositoryWhitelistService();
    }
    return RepositoryWhitelistService.instance;
  }

  /**
   * ホワイトリストを初期化
   */
  public async initialize(): Promise<void> {
    if (this.loaded) return;

    try {
      // configディレクトリが存在しない場合は作成
      if (!fs.existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true });
      }

      // ホワイトリストファイルの読み込み
      if (fs.existsSync(WHITELIST_PATH)) {
        const data = await readFile(WHITELIST_PATH, "utf8");
        this.whitelist = JSON.parse(data);
        console.log(`Loaded ${this.whitelist.length} whitelisted repositories`);
      } else {
        // ファイルが存在しない場合は空のホワイトリストを作成
        this.whitelist = [];
        await this.saveWhitelist();
        console.log("Created new repository whitelist");
      }

      this.loaded = true;
    } catch (error) {
      console.error("Error initializing repository whitelist:", error);
      // エラー時は空のホワイトリストで初期化
      this.whitelist = [];
      this.loaded = true;
    }
  }

  /**
   * ホワイトリストを保存
   */
  private async saveWhitelist(): Promise<void> {
    try {
      await writeFile(
        WHITELIST_PATH,
        JSON.stringify(this.whitelist, null, 2),
        "utf8"
      );
    } catch (error) {
      console.error("Error saving repository whitelist:", error);
    }
  }

  /**
   * ホワイトリスト全体を取得
   */
  public async getWhitelist(): Promise<WhitelistedRepository[]> {
    await this.initialize();
    return [...this.whitelist];
  }

  /**
   * リポジトリがホワイトリストに登録されているか確認
   */
  public async isWhitelisted(
    projectKey: string,
    repositoryName: string
  ): Promise<boolean> {
    await this.initialize();
    return this.whitelist.some(
      (repo) =>
        repo.projectKey === projectKey && repo.repositoryName === repositoryName
    );
  }

  /**
   * リポジトリが自動返信を許可しているか確認
   */
  public async isAutoReplyAllowed(
    projectKey: string,
    repositoryName: string
  ): Promise<boolean> {
    await this.initialize();
    const repo = this.whitelist.find(
      (repo) =>
        repo.projectKey === projectKey && repo.repositoryName === repositoryName
    );

    // リポジトリが登録されていない、または明示的に自動返信が無効になっている場合
    return repo ? repo.allowAutoReply : false;
  }

  /**
   * リポジトリをホワイトリストに追加
   */
  public async addRepository(
    projectKey: string,
    repositoryName: string,
    allowAutoReply: boolean = true,
    addedBy?: string,
    notes?: string
  ): Promise<WhitelistedRepository> {
    await this.initialize();

    // 既存のエントリをチェック
    const existingIndex = this.whitelist.findIndex(
      (repo) =>
        repo.projectKey === projectKey && repo.repositoryName === repositoryName
    );

    const newEntry: WhitelistedRepository = {
      projectKey,
      repositoryName,
      allowAutoReply,
      addedAt: new Date().toISOString(),
      addedBy,
      notes,
    };

    // 既存のエントリがある場合は更新
    if (existingIndex >= 0) {
      this.whitelist[existingIndex] = {
        ...this.whitelist[existingIndex],
        ...newEntry,
      };
    } else {
      // 新規エントリの追加
      this.whitelist.push(newEntry);
    }

    await this.saveWhitelist();
    return newEntry;
  }

  /**
   * リポジトリの自動返信設定を更新
   */
  public async updateAutoReplySettings(
    projectKey: string,
    repositoryName: string,
    allowAutoReply: boolean
  ): Promise<boolean> {
    await this.initialize();

    const repoIndex = this.whitelist.findIndex(
      (repo) =>
        repo.projectKey === projectKey && repo.repositoryName === repositoryName
    );

    if (repoIndex === -1) {
      return false;
    }

    this.whitelist[repoIndex].allowAutoReply = allowAutoReply;
    await this.saveWhitelist();
    return true;
  }

  /**
   * リポジトリをホワイトリストから削除
   */
  public async removeRepository(
    projectKey: string,
    repositoryName: string
  ): Promise<boolean> {
    await this.initialize();

    const initialLength = this.whitelist.length;
    this.whitelist = this.whitelist.filter(
      (repo) =>
        !(
          repo.projectKey === projectKey &&
          repo.repositoryName === repositoryName
        )
    );

    if (initialLength !== this.whitelist.length) {
      await this.saveWhitelist();
      return true;
    }

    return false;
  }
}
