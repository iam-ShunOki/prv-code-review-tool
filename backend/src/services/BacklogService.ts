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
  // Update cloneRepository method to support shallow clones for efficiency
  async cloneRepository(
    projectIdOrKey: string,
    repoIdOrName: string,
    branch: string = "master",
    shallow: boolean = false
  ): Promise<string> {
    const tempRepoDir = path.join(
      this.tempDir,
      `${projectIdOrKey}_${repoIdOrName}_${Date.now()}`
    );

    try {
      // Create temp directory if it doesn't exist
      await mkdirPromise(tempRepoDir, { recursive: true });

      // Backlog git repository access info
      const gitUrl = `${this.spaceKey}@${this.spaceKey}.git.backlog.jp:/${projectIdOrKey}/${repoIdOrName}.git`;
      console.log(`Using SSH git URL: ${gitUrl}`);

      // Clone command with optional shallow flag
      const depthFlag = shallow ? "--depth 1" : "";
      const command = `git clone ${depthFlag} -b ${branch} ${gitUrl} ${tempRepoDir}`;
      console.log(`Executing clone command: ${command}`);
      const { stdout, stderr } = await execPromise(command);

      if (stderr && !stderr.includes("Cloning into")) {
        console.warn(`Clone warning: ${stderr}`);
      }

      console.log(`Repository cloned to ${tempRepoDir}`);

      return tempRepoDir;
    } catch (error) {
      console.error("Repository clone error:", error);

      // Clean up on error
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
        baseBranch,
        true
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
   * プルリクエストの差分を取得（改善版）
   */
  async getPullRequestDiff(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number
  ): Promise<any> {
    try {
      console.log(`Getting diff for PR #${pullRequestId}`);

      // 1. Get PR details
      const prDetails = await this.getPullRequestById(
        projectIdOrKey,
        repoIdOrName,
        pullRequestId
      );

      const baseBranch = prDetails.base;
      const headBranch = prDetails.branch;

      console.log(
        `PR #${pullRequestId} - Base: ${baseBranch}, Head: ${headBranch}`
      );

      // 2. Use git directly for diff
      let tempRepoDir = "";
      try {
        // Clone base branch repository
        tempRepoDir = await this.cloneRepository(
          projectIdOrKey,
          repoIdOrName,
          baseBranch,
          false
        );

        // Fetch all branches
        console.log(`Fetching all remote branches for PR #${pullRequestId}`);
        await execPromise(`cd ${tempRepoDir} && git fetch --all`);

        // Verify branches exist
        const { stdout: branchList } = await execPromise(
          `cd ${tempRepoDir} && git branch -r`
        );
        console.log(`Available remote branches: ${branchList}`);

        const remoteHeadBranch = `origin/${headBranch}`;
        const remoteBaseBranch = `origin/${baseBranch}`;

        if (!branchList.includes(remoteHeadBranch.trim())) {
          console.warn(
            `Head branch ${remoteHeadBranch} not found. Available branches: ${branchList}`
          );
          throw new Error(`Head branch ${headBranch} not found in repository`);
        }

        if (!branchList.includes(remoteBaseBranch.trim())) {
          console.warn(
            `Base branch ${remoteBaseBranch} not found. Available branches: ${branchList}`
          );
          throw new Error(`Base branch ${baseBranch} not found in repository`);
        }

        // 3. Get name-status to properly identify added/modified/deleted files
        console.log(`Getting file status for PR #${pullRequestId}`);
        const { stdout: nameStatusOutput } = await execPromise(
          `cd ${tempRepoDir} && git diff --name-status ${remoteBaseBranch} ${remoteHeadBranch}`
        );

        // Parse name-status output
        const fileStatuses = nameStatusOutput
          .trim()
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => {
            const [statusCode, ...pathParts] = line.split("\t");
            const filePath = pathParts.join("\t"); // Handle paths with tabs
            let status;

            // Map git status codes to our status values
            if (statusCode.startsWith("A")) status = "added";
            else if (statusCode.startsWith("M")) status = "modified";
            else if (statusCode.startsWith("D")) status = "deleted";
            else if (statusCode.startsWith("R")) status = "renamed";
            else status = "unknown";

            return { filePath, status, statusCode };
          });

        console.log(`Changed files: ${fileStatuses.length}`);

        // 4. Checkout head branch to access all files including new ones
        console.log(`Checking out head branch: ${remoteHeadBranch}`);
        await execPromise(
          `cd ${tempRepoDir} && git checkout ${remoteHeadBranch}`
        );

        // 5. Get file details
        const fileDetails = [];
        for (const fileStatus of fileStatuses) {
          try {
            // Skip invalid entries
            if (!fileStatus.filePath) continue;

            let fileDiff = null;
            let fileContent = null;

            // Process based on file status
            if (fileStatus.status === "deleted") {
              // For deleted files, get the diff but not content
              fileDiff = await this.safeExec(
                `cd ${tempRepoDir} && git diff ${remoteBaseBranch} ${remoteHeadBranch} -- "${fileStatus.filePath}"`
              );
            } else {
              // For added/modified files, get both diff and content
              fileDiff = await this.safeExec(
                `cd ${tempRepoDir} && git diff ${remoteBaseBranch} ${remoteHeadBranch} -- "${fileStatus.filePath}"`
              );

              // Get content from head branch (safe even for new files)
              fileContent = await this.safeExec(
                `cd ${tempRepoDir} && cat "${fileStatus.filePath}"`
              );
            }

            fileDetails.push({
              filePath: fileStatus.filePath,
              status: fileStatus.status,
              diff: fileDiff,
              content: fileContent,
              statusCode: fileStatus.statusCode,
            });
          } catch (fileError) {
            console.error(
              `Error processing file: ${fileStatus.filePath}`,
              fileError
            );
            fileDetails.push({
              filePath: fileStatus.filePath,
              status: fileStatus.status,
              diff: null,
              content: null,
              error:
                fileError instanceof Error
                  ? fileError.message
                  : String(fileError),
            });
          }
        }

        return {
          pullRequest: prDetails,
          changedFiles: fileDetails,
          baseCommit: remoteBaseBranch,
          headCommit: remoteHeadBranch,
        };
      } catch (error) {
        console.error(`Error processing PR #${pullRequestId}:`, error);
        if (error instanceof Error) {
          console.error(`  Details: ${error.message}`);
          if ("stdout" in error)
            console.error(`  stdout: ${(error as any).stdout}`);
          if ("stderr" in error)
            console.error(`  stderr: ${(error as any).stderr}`);
        }

        throw error;
      } finally {
        // Clean up
        if (tempRepoDir && fs.existsSync(tempRepoDir)) {
          try {
            await this.cleanupRepository(tempRepoDir);
          } catch (cleanupError) {
            console.error(
              `Error cleaning up repo: ${tempRepoDir}`,
              cleanupError
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching PR diff for #${pullRequestId}:`, error);

      // Fallback
      try {
        const prDetails = await this.getPullRequestById(
          projectIdOrKey,
          repoIdOrName,
          pullRequestId
        );
        return {
          pullRequest: prDetails,
          changedFiles: [],
          error: `Failed to fetch detailed diff: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      } catch (fallbackError) {
        throw new Error(
          `Failed to fetch pull request diff: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  // 安全にコマンドを実行するヘルパーメソッド
  private async safeExec(command: string): Promise<string> {
    try {
      const { stdout } = await execPromise(command);
      return stdout;
    } catch (error) {
      console.error(`Command failed: ${command}`, error);
      return "";
    }
  }

  private sanitizeForBacklog(text: string): string {
    if (!text) return "";

    // Unicode絵文字をテキスト表現に置換
    let sanitized = text
      // 絵文字や特殊記号の置換
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "") // すべての絵文字を除去
      .replace(/🔴/g, "[重要]")
      .replace(/🟠/g, "[注意]")
      .replace(/🟡/g, "[注意]")
      .replace(/🟢/g, "[改善]")
      .replace(/[^\x00-\x7F]/g, function (char) {
        // 非ASCII文字はそのまま保持するが、ここで問題があればエンコードも可能
        return char;
      });

    // 連続した改行を最大2つに制限
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

    return sanitized;
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
      console.log(
        `Comment length before sanitization: ${comment.length} characters`
      );

      // コメントをサニタイズ
      const sanitizedComment = this.sanitizeForBacklog(comment);
      console.log(
        `Comment length after sanitization: ${sanitizedComment.length} characters`
      );

      // コメントの長さをチェック - Backlogの制限は8000文字程度
      const MAX_COMMENT_LENGTH = 8000;
      if (sanitizedComment.length > MAX_COMMENT_LENGTH) {
        console.log(
          `Comment too long (${sanitizedComment.length} chars), splitting into multiple comments`
        );
        return await this.sendSplitComments(
          projectIdOrKey,
          repoIdOrName,
          pullRequestId,
          sanitizedComment
        );
      }

      // 実際のAPIリクエスト
      const response = await axios.post(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`,
        {
          content: sanitizedComment,
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

        // リクエストの詳細をログに出力（デバッグ用）
        if (process.env.NODE_ENV === "development") {
          const reqData = error.config?.data
            ? JSON.parse(error.config.data)
            : {};
          console.error("Request data:", {
            url: error.config?.url,
            method: error.config?.method,
            data: {
              ...reqData,
              content: reqData.content
                ? `${reqData.content.substring(0, 100)}... (truncated)`
                : undefined,
            },
          });
        }
      }

      // APIレスポンスに特定のエラーコードがある場合は、より詳細な情報を提供
      if (axios.isAxiosError(error) && error.response?.data?.errors) {
        const apiErrors = error.response.data.errors;
        console.error("API reported errors:", apiErrors);

        // 特定のエラーに対する回避策
        if (
          apiErrors.some(
            (e: any) => e.message && e.message.includes("Incorrect String")
          )
        ) {
          console.error(
            "Detected encoding/character issue. Attempting fallback with basic ASCII only"
          );

          try {
            // 非ASCII文字を完全に除去した極めてシンプルなメッセージで再試行
            const fallbackComment =
              "## AIコードレビュー結果\n\n" +
              "コードレビューが完了しました。詳細は管理画面を確認してください。\n\n" +
              "注: 特殊文字の問題により、簡略化したメッセージを表示しています。";

            const fallbackResponse = await axios.post(
              `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`,
              {
                content: fallbackComment,
              },
              {
                params: {
                  apiKey: this.apiKey,
                },
              }
            );

            console.log("Successfully sent fallback comment");
            return fallbackResponse.data;
          } catch (fallbackError) {
            console.error("Even fallback comment failed:", fallbackError);
          }
        }
      }

      throw new Error(
        `Failed to add comment to PR #${pullRequestId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 長いコメントを分割して送信（サニタイズ機能追加）
   */
  private async sendSplitComments(
    projectIdOrKey: string,
    repoIdOrName: string,
    pullRequestId: number,
    comment: string
  ): Promise<any> {
    const MAX_COMMENT_LENGTH = 7500; // 安全マージンを取る
    const parts = [];

    // コメントの分割ロジック
    let remainingComment = comment;
    let partNumber = 1;

    while (remainingComment.length > 0) {
      let partLength = Math.min(MAX_COMMENT_LENGTH, remainingComment.length);

      // 文の途中で切らないように調整
      if (partLength < remainingComment.length) {
        // 改行やマークダウンのセクション区切りで分割するのが理想的
        const lastNewline = remainingComment.lastIndexOf("\n\n", partLength);
        const lastHeading = remainingComment.lastIndexOf("\n## ", partLength);
        const lastBreakPoint = Math.max(lastNewline, lastHeading);

        if (lastBreakPoint > partLength / 2) {
          partLength = lastBreakPoint;
        }
      }

      const part = remainingComment.substring(0, partLength);
      const header = `## AIコードレビュー結果 (パート ${partNumber})\n\n`;
      const footer =
        partLength < remainingComment.length
          ? "\n\n*コメントが長いため分割されています。次のコメントに続きます。*"
          : "";

      // サニタイズは既に行われているのでそのまま使用
      parts.push(header + part + footer);
      remainingComment = remainingComment.substring(partLength);
      partNumber++;
    }

    console.log(`Split comment into ${parts.length} parts`);

    // 各パートを順番に送信
    const results = [];
    for (let i = 0; i < parts.length; i++) {
      try {
        console.log(
          `Sending part ${i + 1}/${parts.length} (${parts[i].length} chars)`
        );
        const result = await axios.post(
          `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/pullRequests/${pullRequestId}/comments`,
          {
            content: parts[i],
          },
          {
            params: {
              apiKey: this.apiKey,
            },
          }
        );
        results.push(result.data);

        // API制限を考慮して少し待機（連続リクエスト対策）
        if (i < parts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error sending comment part ${i + 1}:`, error);
        throw error;
      }
    }

    return results[0]; // 最初のコメントの結果を返す
  }

  /**
   * ブランチ一覧を取得
   */
  async getBranches(
    projectIdOrKey: string,
    repoIdOrName: string
  ): Promise<any[]> {
    try {
      console.log(`Fetching branches for ${projectIdOrKey}/${repoIdOrName}`);
      const response = await axios.get(
        `${this.baseUrl}/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/branches`,
        {
          params: {
            apiKey: this.apiKey,
          },
        }
      );

      // 結果のフォーマットを整形
      return response.data.map((branch: any) => ({
        id: branch.id,
        name: branch.name,
        isDefault: Boolean(branch.isDefault),
        lastCommit: branch.lastCommit
          ? {
              id: branch.lastCommit.id,
              message: branch.lastCommit.message,
              authorName: branch.lastCommit.author.name,
              authorEmail: branch.lastCommit.author.mailAddress,
              createdAt: branch.lastCommit.created,
            }
          : null,
      }));
    } catch (error) {
      console.error("Backlog API - ブランチ一覧取得エラー:", error);
      throw new Error("ブランチ一覧の取得に失敗しました");
    }
  }

  /**
   * ファイルツリーを取得
   */
  async getFileTree(
    projectIdOrKey: string,
    repoIdOrName: string,
    branch: string = "master",
    path: string = ""
  ): Promise<any> {
    try {
      console.log(
        `Fetching file tree for ${projectIdOrKey}/${repoIdOrName}/${branch}${
          path ? "/" + path : ""
        }`
      );

      const response = await axios.get(
        `${
          this.baseUrl
        }/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/tree/${encodeURIComponent(
          branch
        )}`,
        {
          params: {
            apiKey: this.apiKey,
            path: path,
          },
        }
      );

      // 結果のフォーマットを整形
      return response.data.map((item: any) => ({
        name: item.name,
        type: item.type, // "file" or "directory"
        size: item.size,
        path: item.path,
        revision: item.revision,
      }));
    } catch (error) {
      console.error("Backlog API - ファイルツリー取得エラー:", error);
      throw new Error("ファイルツリーの取得に失敗しました");
    }
  }

  /**
   * ファイルコンテンツを取得
   */
  async getFileContent(
    projectIdOrKey: string,
    repoIdOrName: string,
    branch: string = "master",
    filePath: string
  ): Promise<string> {
    try {
      console.log(
        `Fetching file content for ${projectIdOrKey}/${repoIdOrName}/${branch}/${filePath}`
      );

      const response = await axios.get(
        `${
          this.baseUrl
        }/projects/${projectIdOrKey}/git/repositories/${repoIdOrName}/raw/${encodeURIComponent(
          branch
        )}/${encodeURIComponent(filePath)}`,
        {
          params: {
            apiKey: this.apiKey,
          },
          responseType: "text",
        }
      );

      return response.data;
    } catch (error) {
      console.error("Backlog API - ファイルコンテンツ取得エラー:", error);
      throw new Error("ファイルコンテンツの取得に失敗しました");
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
