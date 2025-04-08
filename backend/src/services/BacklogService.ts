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
    statusType: number = 1
  ) {
    try {
      // statusIdパラメータを使用せず、正しいパラメータを使用
      // Backlog API v2 では statusId ではなく status が正しいパラメータ名
      // またはパラメータなしでリクエスト
      const response = await axios.get(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests`,
        {
          params: {
            apiKey: this.apiKey,
            statusId: [statusType],
          },
        }
      );

      console.log(
        `プルリクエスト一覧取得: ${projectIdOrKey}/${repoIdOrName} 成功`
      );

      // ステータスでのフィルタリングをコード内で行う
      let result = response.data;
      if (statusType === 1) {
        // APIから取得したデータをコード側でフィルタリング
        result = result.filter(
          (pr: any) => pr.status && pr.status.name === "Open"
        );
      }

      console.log(`取得成功: ${result.length}件のプルリクエスト`);
      return result;
    } catch (error) {
      console.error(
        `プルリクエスト一覧取得エラー (${projectIdOrKey}/${repoIdOrName}):`,
        error
      );

      if (axios.isAxiosError(error) && error.response) {
        console.error(`ステータス: ${error.response.status}`);
        console.error(`詳細エラー: ${JSON.stringify(error.response.data)}`);
      }

      // エラー時は空配列を返す
      return [];
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
   * プルリクエストの差分を取得（改善版）
   */
  async getPullRequestDiff(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number
  ): Promise<any> {
    try {
      console.log(`Getting diff for PR #${pullRequestId}`);

      // PRの詳細情報を取得
      const prDetails = await this.getPullRequestById(
        projectIdOrKey,
        repoIdOrName,
        pullRequestId
      );
      const baseBranch = prDetails.base;
      const headBranch = prDetails.branch;

      // リポジトリをクローン
      let tempRepoDir = "";
      try {
        tempRepoDir = await this.cloneRepository(
          projectIdOrKey,
          repoIdOrName,
          baseBranch,
          false
        );

        // すべてのブランチをフェッチ
        await execPromise(`cd ${tempRepoDir} && git fetch --all`);

        // 変更されたファイル一覧を取得
        const { stdout: nameStatusOutput } = await execPromise(
          `cd ${tempRepoDir} && git diff --name-status origin/${baseBranch} origin/${headBranch}`
        );

        // ファイル状態をパース
        const fileStatuses = nameStatusOutput
          .trim()
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => {
            const [statusCode, ...pathParts] = line.split("\t");
            const filePath = pathParts.join("\t");
            let status = "unknown";

            if (statusCode.startsWith("A")) status = "added";
            else if (statusCode.startsWith("M")) status = "modified";
            else if (statusCode.startsWith("D")) status = "deleted";
            else if (statusCode.startsWith("R")) status = "renamed";

            return { filePath, status, statusCode };
          });

        // 重要な変更: ヘッドブランチをチェックアウトして最新ファイルにアクセス
        await execPromise(
          `cd ${tempRepoDir} && git checkout origin/${headBranch}`
        );

        // 各ファイルの詳細と全体内容を取得
        const fileDetails = [];
        for (const fileStatus of fileStatuses) {
          if (!fileStatus.filePath) continue;

          let fileDiff = null;
          let fileContent = null;
          let fullContent = null; // 新しく追加: 全体コンテンツ

          if (fileStatus.status === "deleted") {
            fileDiff = await this.safeExec(
              `cd ${tempRepoDir} && git diff origin/${baseBranch} origin/${headBranch} -- "${fileStatus.filePath}"`
            );
          } else {
            // 差分を取得
            fileDiff = await this.safeExec(
              `cd ${tempRepoDir} && git diff origin/${baseBranch} origin/${headBranch} -- "${fileStatus.filePath}"`
            );

            // 最新の全体コンテンツを取得 - これが最も重要な変更点
            fullContent = await this.safeExec(
              `cd ${tempRepoDir} && cat "${fileStatus.filePath}"`
            );
            fileContent = fullContent;
          }

          fileDetails.push({
            filePath: fileStatus.filePath,
            status: fileStatus.status,
            diff: fileDiff,
            content: fileContent,
            fullContent: fullContent, // 新しく追加
            statusCode: fileStatus.statusCode,
          });
        }

        return {
          pullRequest: prDetails,
          changedFiles: fileDetails,
          baseCommit: `origin/${baseBranch}`,
          headCommit: `origin/${headBranch}`,
          isFullCodeExtracted: true, // 全体コードが抽出できたことを示す新しいフラグ
        };
      } finally {
        // クリーンアップ処理
        if (tempRepoDir && fs.existsSync(tempRepoDir)) {
          await this.cleanupRepository(tempRepoDir);
        }
      }
    } catch (error) {
      console.error(
        `${pullRequestId} の差分取得中にエラーが発生しました:`,
        error
      );
      // エラー時のフォールバック処理
    }
  }

  // 安全にコマンドを実行するヘルパーメソッド
  private async safeExec(command: string): Promise<string> {
    try {
      const { stdout } = await execPromise(command);
      return stdout;
    } catch (error) {
      console.error(`コマンドが失敗しました: ${command}`, error);
      return "";
    }
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

    try {
      // BacklogのAPIエンドポイントを構築
      const url = `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`;

      // APIキーをクエリパラメータとして追加
      const params = {
        apiKey: this.apiKey,
      };

      // フォームデータとしてコンテンツを送信
      // APIの仕様に合わせて、contentパラメータのみを送信
      const formData = new URLSearchParams();
      formData.append("content", content);

      // ヘッダーを設定
      const config = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        params, // クエリパラメータとしてapiKeyを送信
      };

      // リクエスト送信
      const response = await axios.post(url, formData, config);
      console.log(`コメント送信成功: PR #${pullRequestId}`);
      return response.data;
    } catch (error) {
      // エラー発生時の詳細ログ
      if (axios.isAxiosError(error) && error.response) {
        console.error(
          `Backlog APIエラー [${error.response.status}]: ${JSON.stringify(
            error.response.data
          )}`
        );

        // もしコメントが長すぎる場合は分割して再送信を試みる
        if (content.length > 10000 && error.response.status === 400) {
          console.log("コメントが長すぎるため、分割して送信します");
          return this.sendSplitComments(
            projectIdOrKey,
            repoIdOrName,
            pullRequestId,
            content
          );
        }
      } else {
        console.error(`Backlog API通信エラー:`, error);
      }

      throw new Error(
        `プルリクエストコメントの送信に失敗しました: ${
          error instanceof Error ? error.message : "不明なエラー"
        }`
      );
    }
  }

  /**
   * コメントを分割して送信（コメントが長すぎる場合）
   */
  private async sendSplitComments(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number,
    fullContent: string
  ): Promise<any> {
    try {
      console.log(`コメントを分割して送信します: ${fullContent.length}文字`);

      // 短い導入部分
      const introComment =
        "## AIコードレビュー結果\n\nコメントが長いため複数に分割して送信します。";

      // 最大長（Backlogの制限よりやや短くする）
      const MAX_LENGTH = 8000;

      // コメントを分割
      const parts = [];
      let remainingContent = fullContent;

      while (remainingContent.length > 0) {
        if (parts.length === 0) {
          // 最初のパートは導入部分を含める
          const firstPartLength = MAX_LENGTH - introComment.length - 20;
          let firstPart = remainingContent.substring(0, firstPartLength);

          // マークダウンの構造を壊さないよう、段落や見出しの区切りで分割
          const lastBreakPoint = Math.max(
            firstPart.lastIndexOf("\n\n"),
            firstPart.lastIndexOf("\n### "),
            firstPart.lastIndexOf("\n## ")
          );

          if (lastBreakPoint > firstPartLength / 2) {
            firstPart = remainingContent.substring(0, lastBreakPoint);
          }

          parts.push(
            `${introComment}\n\n## パート 1/${Math.ceil(
              fullContent.length / firstPartLength
            )}\n\n${firstPart}`
          );
          remainingContent = remainingContent.substring(firstPart.length);
        } else {
          // 2つ目以降のパート
          const partNumber: number = parts.length + 1;
          let partContent = remainingContent.substring(0, MAX_LENGTH - 50);

          // マークダウンの構造を壊さないよう分割
          const lastBreakPoint = Math.max(
            partContent.lastIndexOf("\n\n"),
            partContent.lastIndexOf("\n### "),
            partContent.lastIndexOf("\n## ")
          );

          if (lastBreakPoint > MAX_LENGTH / 2) {
            partContent = remainingContent.substring(0, lastBreakPoint);
          }

          parts.push(
            `## AIコードレビュー結果（続き）\n\n## パート ${partNumber}/${Math.ceil(
              fullContent.length / MAX_LENGTH
            )}\n\n${partContent}`
          );
          remainingContent = remainingContent.substring(partContent.length);
        }
      }

      // 各パートを順番に送信
      console.log(`${parts.length}パートに分割しました`);
      let lastResponse = null;

      for (let i = 0; i < parts.length; i++) {
        console.log(`パート ${i + 1}/${parts.length} を送信中...`);

        // APIキーをクエリパラメータとして追加
        const url = `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`;

        const params = {
          apiKey: this.apiKey,
        };

        // フォームデータとしてコンテンツを送信
        const formData = new URLSearchParams();
        formData.append("content", parts[i]);

        const config = {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          params,
        };

        lastResponse = await axios.post(url, formData, config);

        // APIレート制限に配慮して少し待機
        if (i < parts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(`分割コメントの送信が完了しました`);
      return lastResponse?.data;
    } catch (error) {
      console.error(`分割コメント送信中にエラーが発生しました:`, error);

      // 最後の手段として、シンプルな通知だけを送信
      try {
        const fallbackContent =
          "AIコードレビューが完了しました。詳細はアプリケーション内で確認してください。";

        const url = `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`;
        const params = { apiKey: this.apiKey };
        const formData = new URLSearchParams();
        formData.append("content", fallbackContent);

        const response = await axios.post(url, formData, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          params,
        });

        console.log(`フォールバックコメントの送信に成功しました`);
        return response.data;
      } catch (fallbackError) {
        console.error(
          `フォールバックコメントの送信にも失敗しました:`,
          fallbackError
        );
        throw new Error("プルリクエストコメントの送信に完全に失敗しました");
      }
    }
  }

  /**
   * Backlogのリポジトリをクローン
   */
  // Update cloneRepository method to support shallow clones for efficiency
  async cloneRepository(
    projectIdOrKey: string,
    repoIdOrName: string,
    branch: string = "master",
    shallow: boolean = false
  ): Promise<string> {
    const tempDir = path.join(__dirname, "../../temp");
    const tempRepoDir = path.join(
      tempDir,
      `${projectIdOrKey}_${repoIdOrName}_${Date.now()}`
    );

    try {
      // Create temp directory if it doesn't exist
      await mkdirPromise(tempRepoDir, { recursive: true });

      // Backlog git repository access info
      const gitUrl = `${this.spaceKey}@${this.spaceKey}.git.backlog.jp:/${projectIdOrKey}/${repoIdOrName}.git`;
      console.log(`SSH git URL を使用します: ${gitUrl}`);

      // Clone command with optional shallow flag
      const depthFlag = shallow ? "--depth 1" : "";
      const command = `git clone ${depthFlag} -b ${branch} ${gitUrl} ${tempRepoDir}`;
      console.log(`コマンドを実行します: ${command}`);
      const { stdout, stderr } = await execPromise(command);

      if (stderr && !stderr.includes("Cloning into")) {
        console.warn(`クローン警告: ${stderr}`);
      }

      console.log(`リポジトリをクローンしました: ${tempRepoDir}`);

      return tempRepoDir;
    } catch (error) {
      console.error("リポジトリのクローン中にエラーが発生しました:", error);

      // Clean up on error
      if (fs.existsSync(tempRepoDir)) {
        try {
          await rmdirPromise(tempRepoDir, { recursive: true });
        } catch (rmError) {
          console.error(
            "一時ディレクトリのクリーンアップ中にエラーが発生しました:",
            rmError
          );
        }
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`リポジトリのクローンに失敗しました: ${errorMessage}`);
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
