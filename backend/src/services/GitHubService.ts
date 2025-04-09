// backend/src/services/GitHubService.ts
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { exec } from "child_process";

const execPromise = promisify(exec);

export class GitHubService {
  private axiosInstance: AxiosInstance | null = null;
  private baseUrl: string = "https://api.github.com";
  private accessToken: string | null = null;

  /**
   * アクセストークンを使用してGitHub APIクライアントを初期化
   */
  initializeWithToken(accessToken: string): AxiosInstance | null {
    if (!accessToken) {
      console.warn("警告: GitHub アクセストークンが設定されていません");
      return null;
    }

    try {
      this.accessToken = accessToken;

      // axios インスタンスの作成
      this.axiosInstance = axios.create({
        baseURL: this.baseUrl,
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CodeReviewApp",
        },
        timeout: 10000, // 10秒
      });

      // リクエスト/レスポンスインターセプタを設定
      this.axiosInstance.interceptors.response.use(
        (response) => {
          // レート制限情報をログに記録
          const rateLimitRemaining = response.headers["x-ratelimit-remaining"];
          const rateLimitLimit = response.headers["x-ratelimit-limit"];

          if (rateLimitRemaining && rateLimitLimit) {
            console.log(
              `GitHub API レート制限: ${rateLimitRemaining}/${rateLimitLimit} 残り`
            );

            // レート制限に近づいたら警告
            if (parseInt(rateLimitRemaining) < 10) {
              console.warn(
                `警告: GitHub API レート制限がまもなく上限に達します (残り: ${rateLimitRemaining})`
              );
            }
          }

          return response;
        },
        (error) => {
          // エラーハンドリング
          if (error.response) {
            // GitHub APIからのレスポンスがある場合
            console.error(
              "GitHub API エラー:",
              error.response.status,
              error.response.data
            );

            // レート制限エラーの場合は特別な処理
            if (
              error.response.status === 403 &&
              error.response.headers["x-ratelimit-remaining"] === "0"
            ) {
              const resetTime = new Date(
                parseInt(error.response.headers["x-ratelimit-reset"]) * 1000
              );
              console.error(
                `レート制限到達。リセット時間: ${resetTime.toLocaleString()}`
              );
            }
          } else if (error.request) {
            // リクエストは送信されたがレスポンスがない場合
            console.error("GitHub API リクエストエラー:", error.request);
          } else {
            // リクエスト設定中のエラー
            console.error("GitHub API 設定エラー:", error.message);
          }

          return Promise.reject(error);
        }
      );

      console.log("GitHub API初期化成功");
      return this.axiosInstance;
    } catch (error) {
      console.error("GitHub API初期化エラー:", error);
      return null;
    }
  }

  /**
   * Webhookリクエストの署名を検証
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!payload || !signature || !secret) {
      console.warn("署名検証に必要な情報がありません");
      return false;
    }

    try {
      const hmac = crypto.createHmac("sha1", secret);
      const digest = "sha1=" + hmac.update(payload).digest("hex");
      return crypto.timingSafeEqual(
        Buffer.from(digest),
        Buffer.from(signature)
      );
    } catch (error) {
      console.error("署名検証エラー:", error);
      return false;
    }
  }

  /**
   * リポジトリ情報の取得
   */
  async getRepositoryInfo(owner: string, name: string): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(`リポジトリ情報を取得: ${owner}/${name}`);
      const response = await this.axiosInstance.get(`/repos/${owner}/${name}`);
      return response.data;
    } catch (error: any) {
      console.error(`リポジトリ情報取得エラー (${owner}/${name}):`, error);

      if (error.response && error.response.status === 404) {
        return null; // リポジトリが存在しない場合
      }

      throw new Error(
        `リポジトリ情報の取得に失敗しました: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * PRの情報を取得
   */
  async getPullRequestDetails(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(`PR #${pullNumber} (${owner}/${repo}) の詳細を取得します`);
      const response = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/pulls/${pullNumber}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        `PR詳細取得エラー (${owner}/${repo}#${pullNumber}):`,
        error
      );
      throw new Error(
        `PRの詳細を取得できませんでした: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * PRのコメント一覧を取得
   */
  async getPullRequestComments(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<any[]> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(
        `PR #${pullNumber} (${owner}/${repo}) のレビューコメントを取得します`
      );
      // レビューコメントを取得
      const reviewCommentsResponse = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`
      );

      console.log(
        `PR #${pullNumber} (${owner}/${repo}) の会話コメントを取得します`
      );
      // PR自体のコメント（会話）を取得
      const issueCommentsResponse = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/issues/${pullNumber}/comments`
      );

      // 両方のコメントを結合
      const allComments = [
        ...reviewCommentsResponse.data.map((comment: any) => ({
          ...comment,
          comment_type: "review_comment",
        })),
        ...issueCommentsResponse.data.map((comment: any) => ({
          ...comment,
          comment_type: "issue_comment",
        })),
      ];

      // 日付でソート（新しい順）
      allComments.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return allComments;
    } catch (error: any) {
      console.error(
        `PRコメント取得エラー (${owner}/${repo}#${pullNumber}):`,
        error
      );
      throw new Error(
        `PRのコメントを取得できませんでした: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * PRにコメントを追加
   */
  async addPullRequestComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string
  ): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(
        `PR #${pullNumber} (${owner}/${repo}) にコメントを追加します`
      );
      const response = await this.axiosInstance.post(
        `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
        { body }
      );

      return response.data;
    } catch (error: any) {
      console.error(
        `PRコメント追加エラー (${owner}/${repo}#${pullNumber}):`,
        error
      );

      // 文字数制限エラーの場合は、分割送信を試みる
      if (
        error.response &&
        error.response.status === 422 &&
        body.length > 65536
      ) {
        console.log("コメントが長すぎるため、分割して送信を試みます");
        return await this.sendSplitComments(owner, repo, pullNumber, body);
      }

      throw new Error(
        `PRにコメントを追加できませんでした: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * 長いコメントを分割して送信
   */
  private async sendSplitComments(
    owner: string,
    repo: string,
    pullNumber: number,
    fullBody: string
  ): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    // 分割サイズ (GitHubの制限よりも少なめに設定)
    const MAX_COMMENT_SIZE = 60000;

    // 導入部分のコメント
    const introComment =
      "## AIコードレビュー結果\n\nコメントが長いため複数に分割して送信します。";
    await this.axiosInstance.post(
      `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
      { body: introComment }
    );

    // コメント本文を分割
    let remainingText = fullBody;
    let partNumber = 1;
    const totalParts = Math.ceil(fullBody.length / MAX_COMMENT_SIZE);

    while (remainingText.length > 0) {
      // 次のパートサイズを決定
      let nextPartSize = Math.min(remainingText.length, MAX_COMMENT_SIZE - 50);

      // より自然な区切りを探す（段落や見出しの区切り）
      if (nextPartSize < remainingText.length) {
        const possibleBreakPoints = [
          remainingText.lastIndexOf("\n\n", nextPartSize),
          remainingText.lastIndexOf("\n### ", nextPartSize),
          remainingText.lastIndexOf("\n## ", nextPartSize),
          remainingText.lastIndexOf("\n# ", nextPartSize),
        ].filter((point) => point > nextPartSize / 2);

        if (possibleBreakPoints.length > 0) {
          nextPartSize = Math.max(...possibleBreakPoints);
        }
      }

      // 現在のパートを抽出
      const currentPart = remainingText.substring(0, nextPartSize);
      remainingText = remainingText.substring(nextPartSize);

      // パートのタイトルを追加
      const partTitle = `## AIコードレビュー結果（続き）\n\n### パート ${partNumber}/${totalParts}`;
      const partContent = `${partTitle}\n\n${currentPart}`;

      // コメントを送信
      await this.axiosInstance.post(
        `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
        { body: partContent }
      );

      partNumber++;

      // レート制限を避けるために少し待機
      if (remainingText.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return { success: true, parts: partNumber - 1 };
  }

  /**
   * PRの差分を取得
   */
  async getPullRequestDiff(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(`PR #${pullNumber} (${owner}/${repo}) の差分を取得します`);

      // 変更されたファイル一覧を取得
      const filesResponse = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
        {
          // 最大100件のファイルを取得（必要に応じてページネーション対応）
          params: { per_page: 100 },
        }
      );

      // PR詳細情報も取得
      const prDetails = await this.getPullRequestDetails(
        owner,
        repo,
        pullNumber
      );

      // 変更ファイルを解析
      const changedFiles = [];

      for (const file of filesResponse.data) {
        let fileContent = null;

        // 追加または変更されたファイルの場合、内容を取得
        if (file.status !== "removed") {
          try {
            // ファイル内容を取得（ヘッドブランチの最新バージョン）
            const contentResponse = await this.axiosInstance.get(
              `/repos/${owner}/${repo}/contents/${file.filename}`,
              {
                params: { ref: prDetails.head.ref },
              }
            );

            // Base64デコードしてファイル内容を取得
            if (contentResponse.data.encoding === "base64") {
              fileContent = Buffer.from(
                contentResponse.data.content,
                "base64"
              ).toString("utf-8");
            }
          } catch (contentError) {
            console.warn(
              `ファイル内容取得エラー (${file.filename}):`,
              contentError instanceof Error
                ? contentError.message
                : contentError
            );
          }
        }

        changedFiles.push({
          filePath: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch, // 差分パッチ
          fullContent: fileContent, // 完全なファイル内容
          contentsUrl: file.contents_url,
          rawUrl: file.raw_url,
        });
      }

      return {
        pullRequest: {
          number: pullNumber,
          title: prDetails.title,
          description: prDetails.body || "",
          base: prDetails.base.ref,
          head: prDetails.head.ref,
          author: prDetails.user.login,
          createdAt: prDetails.created_at,
          updatedAt: prDetails.updated_at,
        },
        changedFiles,
        isFullCodeExtracted: true, // 全文抽出を行ったことを示すフラグ
      };
    } catch (error: any) {
      console.error(
        `PR差分取得エラー (${owner}/${repo}#${pullNumber}):`,
        error
      );
      throw new Error(
        `PRの差分を取得できませんでした: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * リポジトリのクローン
   */
  async cloneRepository(
    owner: string,
    repo: string,
    branch: string = "main"
  ): Promise<string> {
    // 一時ディレクトリのパス
    const tempDir = path.join(
      __dirname,
      "../../temp",
      `github_${owner}_${repo}_${Date.now()}`
    );

    console.log(`GitHub リポジトリをクローン: ${owner}/${repo} -> ${tempDir}`);

    try {
      // 一時ディレクトリの作成
      await fs.mkdir(tempDir, { recursive: true });

      // クローンコマンドの構築
      const tokenAuth = this.accessToken ? `${this.accessToken}@` : "";
      const cloneUrl = `https://${tokenAuth}github.com/${owner}/${repo}.git`;

      // クローンの実行
      const { stdout, stderr } = await execPromise(
        `git clone --depth 1 -b ${branch} ${cloneUrl} ${tempDir}`
      );

      if (stderr && !stderr.includes("Cloning into")) {
        console.warn(`クローン警告: ${stderr}`);
      }

      console.log(`リポジトリ ${owner}/${repo} をクローンしました`);
      return tempDir;
    } catch (error) {
      console.error(`リポジトリクローンエラー (${owner}/${repo}):`, error);

      // 既にディレクトリが存在している場合は削除を試みる
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (rmError) {
        console.error(`一時ディレクトリ削除エラー: ${tempDir}`, rmError);
      }

      throw new Error(
        `GitHubリポジトリのクローンに失敗しました: ${
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
      console.log(`リポジトリディレクトリを削除します: ${repoDir}`);
      await fs.rm(repoDir, { recursive: true, force: true });
      console.log(`リポジトリディレクトリを削除しました: ${repoDir}`);
    } catch (error) {
      console.error(`リポジトリディレクトリ削除エラー: ${repoDir}`, error);
      throw error;
    }
  }

  /**
   * コミット情報の取得
   */
  async getCommitInfo(owner: string, repo: string, sha: string): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(`コミット情報を取得: ${owner}/${repo}@${sha}`);
      const response = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/commits/${sha}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`コミット情報取得エラー (${owner}/${repo}@${sha}):`, error);
      throw new Error(
        `コミット情報の取得に失敗しました: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * リポジトリのブランチ一覧を取得
   */
  async getRepositoryBranches(owner: string, repo: string): Promise<any[]> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(`ブランチ一覧を取得: ${owner}/${repo}`);
      const response = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/branches`,
        {
          params: { per_page: 100 },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`ブランチ一覧取得エラー (${owner}/${repo}):`, error);
      throw new Error(
        `ブランチ一覧の取得に失敗しました: ${error.message || "不明なエラー"}`
      );
    }
  }

  /**
   * ファイル内容の取得
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string = "main"
  ): Promise<string> {
    if (!this.axiosInstance) {
      throw new Error("GitHub APIが初期化されていません");
    }

    try {
      console.log(`ファイル内容を取得: ${owner}/${repo}/${path}@${ref}`);
      const response = await this.axiosInstance.get(
        `/repos/${owner}/${repo}/contents/${path}`,
        {
          params: { ref },
        }
      );

      // Base64デコード
      if (response.data.encoding === "base64") {
        return Buffer.from(response.data.content, "base64").toString("utf-8");
      } else {
        throw new Error(
          `サポートされていないエンコーディング: ${response.data.encoding}`
        );
      }
    } catch (error: any) {
      console.error(
        `ファイル内容取得エラー (${owner}/${repo}/${path}@${ref}):`,
        error
      );
      throw new Error(
        `ファイル内容の取得に失敗しました: ${error.message || "不明なエラー"}`
      );
    }
  }
}
