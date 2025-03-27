// backend/src/services/BacklogService.ts
import axios from "axios";
import path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { exec } from "child_process";
import { AppDataSource } from "../index";
import { Review } from "../models/Review";
import { CodeSubmission, SubmissionStatus } from "../models/CodeSubmission";
import { BacklogRepository } from "../models/BacklogRepository";

const execPromise = promisify(exec);
const mkdirPromise = promisify(fs.mkdir);
const unlinkPromise = promisify(fs.unlink);
const rmdirPromise = promisify(fs.rmdir);

export class BacklogService {
  private apiKey: string;
  private spaceKey: string;
  private baseUrl: string;
  private reviewRepository = AppDataSource.getRepository(Review);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private backlogRepositoryRepository =
    AppDataSource.getRepository(BacklogRepository);

  constructor() {
    this.apiKey = process.env.BACKLOG_API_KEY || "";
    this.spaceKey = process.env.BACKLOG_SPACE || "";
    this.baseUrl = `https://${this.spaceKey}.backlog.jp/api/v2`;

    if (!this.apiKey || !this.spaceKey) {
      console.log(
        "警告: Backlog APIキーまたはスペースキーが設定されていません"
      );
    } else {
      console.log(`Backlog API初期化: ${this.spaceKey}.backlog.jp`);
    }
  }

  /**
   * Backlog APIを呼び出す共通メソッド
   */
  private async callApi(
    endpoint: string,
    method: "get" | "post" | "patch" | "delete" = "get",
    data?: any
  ) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const params = method === "get" ? { apiKey: this.apiKey } : {};
      const requestData =
        method !== "get" ? { ...data, apiKey: this.apiKey } : {};

      console.log(`Backlog API呼び出し: ${method.toUpperCase()} ${endpoint}`);

      const response = await axios({
        method,
        url,
        params,
        data: method !== "get" ? requestData : undefined,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error(
          `Backlog APIエラー [${error.response.status}]: ${
            error.response.data.errors?.[0]?.message ||
            JSON.stringify(error.response.data)
          }`
        );
        throw new Error(
          `Backlog API ${endpoint} の呼び出しに失敗しました: ${
            error.response.data.errors?.[0]?.message || "APIエラー"
          }`
        );
      } else {
        console.error("Backlog API通信エラー:", error);
        throw new Error("Backlogとの通信中にエラーが発生しました");
      }
    }
  }

  /**
   * プロジェクト一覧を取得
   */
  async getProjects() {
    return this.callApi("/projects");
  }

  /**
   * リポジトリ一覧を取得
   */
  async getRepositories(projectIdOrKey: string) {
    return this.callApi(`/projects/${projectIdOrKey}/git/repositories`);
  }

  /**
   * プルリクエスト一覧を取得
   */
  async getPullRequests(
    projectIdOrKey: string,
    repoIdOrName: string,
    statusId: string = "all"
  ) {
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      statusId,
    });

    const url = `${
      this.baseUrl
    }/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests?${params.toString()}`;

    try {
      console.log(
        `プルリクエスト一覧取得: ${projectIdOrKey}/${repoIdOrName} (ステータス: ${statusId})`
      );
      const response = await axios.get(url);
      console.log(`取得成功: ${response.data.length}件のプルリクエスト`);
      return response.data;
    } catch (error) {
      console.error(
        `プルリクエスト一覧取得エラー (${projectIdOrKey}/${repoIdOrName}):`,
        error
      );
      throw error;
    }
  }

  /**
   * プルリクエストの詳細を取得
   */
  async getPullRequestById(
    projectIdOrKey: string,
    repoIdOrName: string,
    number: number
  ) {
    return this.callApi(
      `/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${number}`
    );
  }

  /**
   * プルリクエストの差分を取得
   */
  async getPullRequestDiff(
    projectIdOrKey: string,
    repoIdOrName: string,
    number: number
  ) {
    return this.callApi(
      `/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${number}/diff`
    );
  }

  /**
   * プルリクエストにコメントを追加
   */
  async addPullRequestComment(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number,
    content: string
  ) {
    console.log(
      `プルリクエストコメント送信: ${projectIdOrKey}/${repoIdOrName} PR #${pullRequestId}`
    );
    console.log(`コメント長: ${content.length}文字`);

    return this.callApi(
      `/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`,
      "post",
      { content }
    );
  }

  /**
   * リポジトリをクローン
   */
  async cloneRepository(
    projectKey: string,
    repoName: string,
    branch: string = "master"
  ): Promise<string> {
    const tempDir = path.join(__dirname, "../../temp");
    const repoDir = path.join(
      tempDir,
      `${projectKey}_${repoName}_${Date.now()}`
    );

    try {
      // 一時ディレクトリが存在するか確認
      if (!fs.existsSync(tempDir)) {
        await mkdirPromise(tempDir, { recursive: true });
        console.log(`一時ディレクトリを作成しました: ${tempDir}`);
      }

      // リポジトリディレクトリを作成
      await mkdirPromise(repoDir, { recursive: true });
      console.log(`リポジトリディレクトリを作成しました: ${repoDir}`);

      // Backlogのギットリポジトリへのアクセス情報
      const gitUrl = `https://${this.spaceKey}.backlog.jp/git/${projectKey}/${repoName}.git`;
      console.log(`リポジトリをクローン中: ${gitUrl} (${branch}ブランチ)`);

      // クローンコマンドを実行
      const command = `git clone -b ${branch} --single-branch ${gitUrl} "${repoDir}"`;
      await execPromise(command);
      console.log(`クローン完了: ${repoDir}`);

      return repoDir;
    } catch (error) {
      console.error(
        `リポジトリクローンエラー (${projectKey}/${repoName}):`,
        error
      );

      // エラー発生時は作成したディレクトリを削除
      try {
        if (fs.existsSync(repoDir)) {
          await this.cleanupRepository(repoDir);
        }
      } catch (cleanupError) {
        console.error("クリーンアップ中にエラーが発生しました:", cleanupError);
      }

      throw new Error(
        `リポジトリのクローンに失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * リポジトリのクリーンアップ
   */
  async cleanupRepository(repoDir: string): Promise<void> {
    try {
      console.log(`リポジトリを削除します: ${repoDir}`);
      await rmdirPromise(repoDir, { recursive: true });
      console.log(`リポジトリの削除が完了しました: ${repoDir}`);
    } catch (error) {
      console.error(`リポジトリ削除エラー (${repoDir}):`, error);
      throw error;
    }
  }

  /**
   * コード変更をプルリクエストとして提出
   */
  async submitCodeChanges(
    reviewId: number,
    projectKey: string,
    repoName: string,
    baseBranch: string = "master"
  ): Promise<any> {
    console.log(
      `コード変更をプルリクエストとして提出: レビューID ${reviewId}, プロジェクト ${projectKey}, リポジトリ ${repoName}`
    );

    // レビュー情報を取得
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ["submissions"],
    });

    if (!review) {
      throw new Error(`レビューID ${reviewId} が見つかりません`);
    }

    // 最新のコード提出を取得
    const submissions = await this.submissionRepository.find({
      where: { review_id: reviewId },
      order: { version: "DESC" },
    });

    if (!submissions || submissions.length === 0) {
      throw new Error(
        `レビューID ${reviewId} に対するコード提出が見つかりません`
      );
    }

    const latestSubmission = submissions[0];
    const codeContent = latestSubmission.code_content;

    // ブランチ名作成（レビューID + タイムスタンプ）
    const timestamp = new Date().getTime();
    const branchName = `review-${reviewId}-${timestamp}`;

    let tempRepoDir = "";
    try {
      // リポジトリをクローン
      tempRepoDir = await this.cloneRepository(
        projectKey,
        repoName,
        baseBranch
      );

      // ファイルを書き込む（仮の実装：プルリクエストのタイトルと同じ名前のファイルを作成）
      const fileName = `review-${reviewId}-changes.js`;
      const filePath = path.join(tempRepoDir, fileName);

      // ファイルへのコード書き込み
      fs.writeFileSync(filePath, codeContent);

      // Gitコマンドを実行
      const commands = [
        `cd "${tempRepoDir}" && git config user.name "Code Review Bot"`,
        `cd "${tempRepoDir}" && git config user.email "codereviewer@example.com"`,
        `cd "${tempRepoDir}" && git checkout -b ${branchName}`,
        `cd "${tempRepoDir}" && git add "${fileName}"`,
        `cd "${tempRepoDir}" && git commit -m "レビューID ${reviewId} からの変更"`,
        `cd "${tempRepoDir}" && git push origin ${branchName}`,
      ];

      for (const command of commands) {
        console.log(`コマンド実行: ${command}`);
        await execPromise(command);
      }

      // Backlog APIを使用してプルリクエストを作成
      const pullRequestData = {
        projectId: projectKey,
        repositoryId: repoName,
        summary: `レビューID ${reviewId} からの変更`,
        description: `コードレビューツールからの自動提出\n\nレビューID: ${reviewId}\nレビュータイトル: ${review.title}`,
        base: baseBranch,
        branch: branchName,
      };

      const pullRequest = await this.callApi(
        `/projects/${projectKey}/git/repositories/${repoName}/pullRequests`,
        "post",
        pullRequestData
      );

      console.log(`プルリクエスト作成成功: PR #${pullRequest.number}`);

      // レビュー情報を更新
      review.backlog_pr_id = pullRequest.number;
      review.backlog_project = projectKey;
      review.backlog_repository = repoName;
      await this.reviewRepository.save(review);

      return pullRequest;
    } catch (error) {
      console.error("プルリクエスト作成エラー:", error);
      throw new Error(
        `プルリクエストの作成に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      // 一時ディレクトリの削除
      if (tempRepoDir) {
        try {
          await this.cleanupRepository(tempRepoDir);
        } catch (cleanupError) {
          console.error(
            "一時ディレクトリの削除中にエラーが発生しました:",
            cleanupError
          );
        }
      }
    }
  }

  /**
   * プルリクエストのコメント一覧を取得（新機能）
   */
  async getPullRequestComments(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number,
    options?: {
      count?: number;
      order?: "desc" | "asc";
    }
  ): Promise<any[]> {
    try {
      console.log(
        `プルリクエストコメント取得: ${projectIdOrKey}/${repoIdOrName} PR #${pullRequestId}`
      );

      const params = new URLSearchParams({
        apiKey: this.apiKey,
        count: options?.count?.toString() || "100",
        order: options?.order || "desc",
      });

      const url = `${
        this.baseUrl
      }/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments?${params.toString()}`;

      const response = await axios.get(url);
      console.log(`コメント取得成功: ${response.data.length}件のコメント`);

      return response.data;
    } catch (error) {
      console.error(
        `プルリクエストコメント取得エラー (${projectIdOrKey}/${repoIdOrName} PR #${pullRequestId}):`,
        error
      );
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `コメント取得エラー: ${
            error.response.data.errors?.[0]?.message || "APIエラー"
          }`
        );
      } else {
        throw new Error("Backlogコメント取得中にエラーが発生しました");
      }
    }
  }

  /**
   * ブランチ一覧を取得（新機能）
   */
  async getBranches(
    projectIdOrKey: string,
    repoIdOrName: string
  ): Promise<any[]> {
    try {
      console.log(`ブランチ一覧取得: ${projectIdOrKey}/${repoIdOrName}`);
      return this.callApi(
        `/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/branches`
      );
    } catch (error) {
      console.error(
        `ブランチ一覧取得エラー (${projectIdOrKey}/${repoIdOrName}):`,
        error
      );
      throw error;
    }
  }

  /**
   * ファイルツリーを取得（新機能）
   */
  async getFileTree(
    projectIdOrKey: string,
    repoIdOrName: string,
    branch: string = "master",
    path: string = ""
  ): Promise<any> {
    try {
      console.log(
        `ファイルツリー取得: ${projectIdOrKey}/${repoIdOrName} (${branch}:${
          path || "/"
        })`
      );

      const params = new URLSearchParams({
        apiKey: this.apiKey,
        branch: branch,
        path: path,
      });

      const url = `${
        this.baseUrl
      }/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/trees?${params.toString()}`;

      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(
        `ファイルツリー取得エラー (${projectIdOrKey}/${repoIdOrName}):`,
        error
      );
      throw error;
    }
  }

  /**
   * リポジトリとプロジェクトの関連付けを更新（新機能）
   */
  async updateRepositoryProjectMapping(
    repositoryId: number,
    projectKey: string,
    repositoryName: string,
    mainBranch: string = "master"
  ): Promise<BacklogRepository> {
    try {
      console.log(
        `リポジトリとプロジェクトの関連付けを更新: リポジトリID ${repositoryId}, プロジェクト ${projectKey}, リポジトリ ${repositoryName}`
      );

      // リポジトリ情報を取得
      let repository = await this.backlogRepositoryRepository.findOneBy({
        id: repositoryId,
      });

      if (!repository) {
        throw new Error(`リポジトリID ${repositoryId} が見つかりません`);
      }

      // 情報を更新
      repository.project_key = projectKey;
      repository.repository_name = repositoryName;
      repository.main_branch = mainBranch;

      // プロジェクト名を取得して設定
      try {
        const projectInfo = await this.callApi(`/projects/${projectKey}`);
        repository.project_name = projectInfo.name || projectKey;
      } catch (projectError) {
        console.warn(
          `プロジェクト情報取得エラー: ${
            projectError instanceof Error
              ? projectError.message
              : String(projectError)
          }`
        );
        repository.project_name = projectKey; // エラー時はプロジェクトキーを名前として使用
      }

      // 保存して返却
      const updatedRepository = await this.backlogRepositoryRepository.save(
        repository
      );
      console.log(`リポジトリマッピング更新完了: ID ${updatedRepository.id}`);

      return updatedRepository;
    } catch (error) {
      console.error("リポジトリマッピング更新エラー:", error);
      throw new Error(
        `リポジトリとプロジェクトの関連付け更新に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * ファイル内容を取得（新機能）
   */
  async getFileContent(
    projectIdOrKey: string,
    repoIdOrName: string,
    path: string,
    branch: string = "master"
  ): Promise<string> {
    try {
      console.log(
        `ファイル内容取得: ${projectIdOrKey}/${repoIdOrName} (${branch}:${path})`
      );

      const params = new URLSearchParams({
        apiKey: this.apiKey,
        branch: branch,
      });

      const url = `${
        this.baseUrl
      }/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/contents/${encodeURIComponent(
        path
      )}?${params.toString()}`;

      const response = await axios.get(url);

      // Base64エンコードされたファイル内容をデコード
      if (response.data && response.data.content) {
        const content = Buffer.from(response.data.content, "base64").toString(
          "utf-8"
        );
        return content;
      }

      throw new Error("ファイル内容が取得できませんでした");
    } catch (error) {
      console.error(
        `ファイル内容取得エラー (${projectIdOrKey}/${repoIdOrName}:${path}):`,
        error
      );
      throw error;
    }
  }
}
