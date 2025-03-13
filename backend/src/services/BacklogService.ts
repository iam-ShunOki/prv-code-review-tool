// backend/src/services/BacklogService.ts
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { AppDataSource } from "../index";
import { User } from "../models/User";
import { Review } from "../models/Review";
import { CodeSubmission } from "../models/CodeSubmission";

const execPromise = promisify(exec);
const mkdirPromise = promisify(fs.mkdir);
const writeFilePromise = promisify(fs.writeFile);
const rmdirPromise = promisify(fs.rmdir);

export class BacklogService {
  private baseUrl: string;
  private apiKey: string;
  private spaceKey: string;
  private tempDir: string;

  constructor() {
    this.apiKey = process.env.BACKLOG_API_KEY || "";
    this.spaceKey = process.env.BACKLOG_SPACE || "";
    this.baseUrl = `https://${this.spaceKey}.backlog.jp/api/v2`;

    // 一時ディレクトリをプロジェクト外に配置
    // Windows環境の場合
    if (process.platform === "win32") {
      this.tempDir = path.join(
        process.env.TEMP || "C:\\temp",
        "codereview-temp"
      );
    }
    // Linux/Mac環境の場合
    else {
      this.tempDir = path.join("/tmp", "codereview-temp");
    }

    // 一時ディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
        console.log(`Created temp directory: ${this.tempDir}`);
      } catch (error) {
        console.error(`Failed to create temp directory: ${error}`);
        // フォールバックとしてプロジェクト内のtempディレクトリを使用
        this.tempDir = path.join(__dirname, "../../temp");
        if (!fs.existsSync(this.tempDir)) {
          fs.mkdirSync(this.tempDir, { recursive: true });
        }
      }
    }
  }

  /**
   * プロジェクトの一覧を取得
   */
  async getProjects(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/projects`, {
        params: {
          apiKey: this.apiKey,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Backlog API - プロジェクト一覧取得エラー:", error);
      throw new Error("プロジェクト一覧の取得に失敗しました");
    }
  }

  /**
   * リポジトリの一覧を取得
   */
  async getRepositories(projectIdOrKey: string): Promise<any[]> {
    try {
      console.log(`Fetching repositories for project: ${projectIdOrKey}`);
      const response = await axios.get(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories`,
        {
          params: {
            apiKey: this.apiKey,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Backlog API - リポジトリ一覧取得エラー:", error);
      throw new Error("リポジトリ一覧の取得に失敗しました");
    }
  }

  /**
   * Backlogのリポジトリをクローン
   */
  async cloneRepository(
    projectIdOrKey: string,
    repoIdOrName: string,
    branch: string = "master"
  ): Promise<string> {
    const tempRepoDir = path.join(
      this.tempDir,
      `${projectIdOrKey}_${repoIdOrName}_${Date.now()}`
    );

    try {
      // 一時ディレクトリが存在しない場合は作成
      if (!fs.existsSync(this.tempDir)) {
        await mkdirPromise(this.tempDir, { recursive: true });
      }

      // Backlogドキュメントに準拠したSSH URLの構築
      const gitUrl = `${this.spaceKey}@${this.spaceKey}.git.backlog.jp:/${projectIdOrKey}/${repoIdOrName}.git`;
      console.log(`Using SSH git URL: ${gitUrl}`);

      // クローンコマンドを実行
      const command = `git clone -b ${branch} ${gitUrl} ${tempRepoDir}`;
      console.log(`Executing clone command: ${command}`);
      const { stdout, stderr } = await execPromise(command);

      if (stderr && !stderr.includes("Cloning into")) {
        console.warn(`Clone warning: ${stderr}`);
      }

      console.log(`Clone stdout: ${stdout}`);
      console.log(`Repository cloned to ${tempRepoDir}`);

      return tempRepoDir;
    } catch (error) {
      console.error("Repository clone error:", error);

      // エラー発生時は一時ディレクトリを削除
      if (fs.existsSync(tempRepoDir)) {
        try {
          await rmdirPromise(tempRepoDir, { recursive: true });
        } catch (rmError) {
          console.error("Temp directory cleanup error:", rmError);
        }
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clone repository: ${errorMessage}`);
    }
  }

  /**
   * プルリクエストを作成
   */
  async createPullRequest(
    projectIdOrKey: string,
    repoIdOrName: string,
    params: {
      title: string;
      description: string;
      base: string;
      branch: string;
    }
  ): Promise<any> {
    try {
      console.log(`Creating pull request in ${projectIdOrKey}/${repoIdOrName}`);
      const response = await axios.post(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests`,
        {
          summary: params.title,
          description: params.description,
          base: params.base,
          branch: params.branch,
        },
        {
          params: {
            apiKey: this.apiKey,
          },
        }
      );
      console.log(
        `Pull request created successfully: #${response.data.number}`
      );
      return response.data;
    } catch (error) {
      console.error("Backlog API - プルリクエスト作成エラー:", error);
      throw new Error("プルリクエストの作成に失敗しました");
    }
  }

  /**
   * ブランチを作成して変更をプッシュ
   */
  async createBranchAndPush(
    repoPath: string,
    branchName: string,
    files: { path: string; content: string }[],
    commitMessage: string
  ): Promise<void> {
    try {
      console.log(`Creating branch: ${branchName} in ${repoPath}`);
      // 新しいブランチを作成
      await execPromise(`cd ${repoPath} && git checkout -b ${branchName}`);

      // ファイルを書き込み
      for (const file of files) {
        const filePath = path.join(repoPath, file.path);
        const dirPath = path.dirname(filePath);

        // 必要なディレクトリを作成
        if (!fs.existsSync(dirPath)) {
          await mkdirPromise(dirPath, { recursive: true });
        }

        // ファイルを書き込み
        await writeFilePromise(filePath, file.content);
        console.log(`Created file: ${file.path}`);
      }

      // 変更をステージングしてコミット
      await execPromise(
        `cd ${repoPath} && git add -A && git commit -m "${commitMessage}"`
      );
      console.log(`Changes committed: ${commitMessage}`);

      // 変更をプッシュ
      await execPromise(`cd ${repoPath} && git push origin ${branchName}`);
      console.log(`Branch pushed: ${branchName}`);
    } catch (error) {
      console.error("ブランチ作成・プッシュエラー:", error);
      throw new Error("ブランチの作成とプッシュに失敗しました");
    }
  }

  /**
   * コード修正をBacklogにプッシュしてプルリクエストを作成
   */
  async submitCodeChanges(
    reviewId: number,
    projectIdOrKey: string,
    repoIdOrName: string,
    baseBranch: string = "master"
  ): Promise<any> {
    let tempRepoDir = "";

    try {
      console.log(`Submitting code changes for review #${reviewId}`);
      // レビュー情報を取得
      const reviewRepository = AppDataSource.getRepository(Review);
      const review = await reviewRepository.findOne({
        where: { id: reviewId },
        relations: ["user"],
      });

      if (!review) {
        throw new Error("レビューが見つかりません");
      }

      // ユーザー情報を取得
      const user = await AppDataSource.getRepository(User).findOne({
        where: { id: review.user.id },
      });

      if (!user) {
        throw new Error("ユーザーが見つかりません");
      }

      // 最新のコード提出を取得
      const submissionRepository = AppDataSource.getRepository(CodeSubmission);
      const latestSubmission = await submissionRepository.findOne({
        where: { review_id: reviewId },
        order: { version: "DESC" },
      });

      if (!latestSubmission) {
        throw new Error("コード提出が見つかりません");
      }

      // リポジトリをクローン
      tempRepoDir = await this.cloneRepository(
        projectIdOrKey,
        repoIdOrName,
        baseBranch
      );

      // ブランチ名を生成（ユーザー名_reviewId_タイムスタンプ）
      const branchName = `review_${reviewId}_${Date.now()}`;

      // ファイルを作成（実際にはコード内容に応じて適切なファイルパスを設定する必要があります）
      const files = [
        {
          path: `review_${reviewId}/${review.title.replace(
            /[^\w\s]/gi,
            "_"
          )}.js`,
          content: latestSubmission.code_content,
        },
      ];

      // コミットメッセージを設定
      const commitMessage = `コードレビュー #${reviewId}: ${review.title}`;

      // ブランチを作成してプッシュ
      await this.createBranchAndPush(
        tempRepoDir,
        branchName,
        files,
        commitMessage
      );

      // プルリクエストを作成
      const pullRequestParams = {
        title: `【コードレビュー】${review.title}`,
        description: `
## コードレビュー提出

### レビュー情報
- レビューID: ${reviewId}
- タイトル: ${review.title}
- 提出者: ${user.name}
- 提出バージョン: ${latestSubmission.version}

### 説明
${review.description || "なし"}

### 提出コメント
${latestSubmission.expectation || "なし"}
`,
        base: baseBranch,
        branch: branchName,
      };

      const pullRequest = await this.createPullRequest(
        projectIdOrKey,
        repoIdOrName,
        pullRequestParams
      );

      return pullRequest;
    } catch (error) {
      console.error("コード変更提出エラー:", error);
      throw error;
    } finally {
      // 一時ディレクトリを削除
      if (tempRepoDir && fs.existsSync(tempRepoDir)) {
        try {
          await rmdirPromise(tempRepoDir, { recursive: true });
          console.log(`Cleaned up temporary directory: ${tempRepoDir}`);
        } catch (rmError) {
          console.error("一時ディレクトリ削除エラー:", rmError);
        }
      }
    }
  }

  /**
   * 一時ディレクトリを削除する
   */
  async cleanupRepository(tempDir: string): Promise<void> {
    try {
      if (fs.existsSync(tempDir)) {
        await rmdirPromise(tempDir, { recursive: true });
        console.log(`一時ディレクトリを削除しました: ${tempDir}`);
      }
    } catch (error) {
      console.error("一時ディレクトリ削除エラー:", error);
      throw new Error("一時ディレクトリの削除に失敗しました");
    }
  }

  /**
   * プルリクエスト一覧を取得
   */
  async getPullRequests(
    projectIdOrKey: string,
    repoIdOrName: string,
    statusFilters: "open" | "closed" | "merged" | "all" = "all"
  ): Promise<any[]> {
    try {
      console.log(
        `Fetching pull requests for ${projectIdOrKey}/${repoIdOrName} (status: ${statusFilters})`
      );
      const params: any = {
        apiKey: this.apiKey,
      };

      // Filter by status if specified
      if (statusFilters !== "all") {
        params.statusId = [this.getPullRequestStatusId(statusFilters)];
      }

      const response = await axios.get(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests`,
        { params }
      );

      console.log(`Retrieved ${response.data.length} pull requests`);
      return response.data;
    } catch (error) {
      console.error("Backlog API - Pull requests fetch error:", error);
      throw new Error("Failed to fetch pull requests");
    }
  }

  /**
   * プルリクエスト詳細を取得
   */
  async getPullRequestById(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number
  ): Promise<any> {
    try {
      console.log(
        `Fetching PR #${pullRequestId} from ${projectIdOrKey}/${repoIdOrName}`
      );

      const response = await axios.get(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}`,
        {
          params: {
            apiKey: this.apiKey,
          },
        }
      );

      console.log(`Successfully retrieved PR #${pullRequestId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch PR #${pullRequestId}:`, error);
      throw new Error(
        `Failed to fetch pull request #${pullRequestId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * プルリクエストの差分を取得
   */
  async getPullRequestDiff(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number
  ): Promise<any> {
    try {
      console.log(`Getting diff for PR #${pullRequestId}`);

      // 1. PR詳細を取得
      const prDetails = await this.getPullRequestById(
        projectIdOrKey,
        repoIdOrName,
        pullRequestId
      );

      // 2. コミット一覧を取得
      console.log(`Fetching commits for PR #${pullRequestId}`);
      const commitsResponse = await axios.get(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/commits`,
        {
          params: {
            apiKey: this.apiKey,
          },
        }
      );

      const commits = commitsResponse.data;
      console.log(`Found ${commits.length} commits in PR #${pullRequestId}`);

      // 3. 各コミットの差分を取得
      let diffResults = [];

      // 最大5コミットまで処理（パフォーマンス対策）
      const commitsToProcess = commits.slice(0, Math.min(5, commits.length));

      for (const commit of commitsToProcess) {
        try {
          console.log(`Fetching diff for commit ${commit.id}`);
          const diffResponse = await axios.get(
            `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/commits/${commit.id}/diffs`,
            {
              params: {
                apiKey: this.apiKey,
              },
            }
          );

          diffResults.push({
            commitId: commit.id,
            message: commit.message,
            diffs: diffResponse.data,
          });
        } catch (commitError) {
          console.error(
            `Error fetching diff for commit ${commit.id}:`,
            commitError
          );
          // エラーがあっても続行
        }
      }

      return {
        pullRequest: prDetails,
        commits: commits,
        diffs: diffResults,
      };
    } catch (error) {
      console.error(`Error fetching PR diff for #${pullRequestId}:`, error);
      // エラー時はPR詳細情報のみを返す
      try {
        const prDetails = await this.getPullRequestById(
          projectIdOrKey,
          repoIdOrName,
          pullRequestId
        );
        return { pullRequest: prDetails, commits: [], diffs: [] };
      } catch (detailsError) {
        throw new Error(
          `Failed to fetch pull request diff: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /**
   * プルリクエストにコメントを追加
   */
  async addPullRequestComment(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number,
    comment: string
  ): Promise<any> {
    try {
      console.log(`Adding comment to PR #${pullRequestId}`);
      console.log(`Comment length: ${comment.length} characters`);

      const response = await axios.post(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`,
        {
          content: comment,
        },
        {
          params: {
            apiKey: this.apiKey,
          },
        }
      );

      console.log(`Successfully added comment to PR #${pullRequestId}`);
      return response.data;
    } catch (error) {
      console.error(`Error adding comment to PR #${pullRequestId}:`, error);

      if (axios.isAxiosError(error) && error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data:`, error.response.data);
      }

      throw new Error(
        `Failed to add comment to PR #${pullRequestId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Convert status string to Backlog status ID
   */
  private getPullRequestStatusId(status: "open" | "closed" | "merged"): number {
    switch (status) {
      case "open":
        return 1;
      case "closed":
        return 2;
      case "merged":
        return 3;
      default:
        return 1;
    }
  }
}
