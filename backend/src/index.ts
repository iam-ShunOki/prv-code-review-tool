import "reflect-metadata";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import { PullRequestMonitoringService } from "./services/PullRequestMonitoringService";
import { WebhookUrlService } from "./services/WebhookUrlService";
import { RepositoryWhitelistService } from "./services/RepositoryWhitelistService";

// 環境変数の読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ミドルウェアの設定
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// データベース接続設定
// 注: AppDataSourceはdata-source.tsから既にインポート済み

// プルリクエストモニタリングの初期化
async function initializePullRequestMonitoring() {
  try {
    console.log("Initializing pull request monitoring...");
    const monitoringService = new PullRequestMonitoringService();
    const result = await monitoringService.checkExistingPullRequests();
    console.log(
      `Pull request monitoring initialized: processed ${result.processed} PRs, skipped ${result.skipped} PRs`
    );
    // WebhookUrlServiceの初期化
    const webhookUrlService = WebhookUrlService.getInstance();
    console.log(
      `Current webhook base URL: ${webhookUrlService.getWebhookBaseUrl()}`
    );
  } catch (error) {
    console.error("Error initializing pull request monitoring:", error);
  }
}

// サーバー起動関数
async function startServer() {
  try {
    // データベース接続
    await AppDataSource.initialize();
    console.log("データベースに接続しました");

    // リポジトリホワイトリストを初期化
    await RepositoryWhitelistService.getInstance().initialize();
    console.log("リポジトリホワイトリストを初期化しました");

    // ルートルートのセットアップ
    app.get("/", (req, res) => {
      res.json({ message: "コードレビューツール API サーバー" });
    });

    // プルリクエストモニタリングを初期化
    await initializePullRequestMonitoring();

    // サーバー起動
    app.listen(PORT, () => {
      console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("サーバー起動エラー:", error);
    process.exit(1);
  }
}

// APIルートのセットアップ
import authRoutes from "./routes/authRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import submissionRoutes from "./routes/submissionRoutes";
import queueRoutes from "./routes/queueRoutes";
import employeeRoutes from "./routes/employeeRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import backlogRoutes from "./routes/backlogRoutes";
import progressRoutes from "./routes/progressRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import feedbackRoutes from "./routes/feedbackRoutes";
import adminRepositoryRoutes from "./routes/adminRepositoryRoutes";
import webhookRoutes from "./routes/webhookRoutes";
import repositoryWhitelistRoutes from "./routes/repositoryWhitelistRoutes";

// ルートの登録
app.use("/api/auth", authRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/backlog", backlogRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin/repositories", adminRepositoryRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/admin/repository-whitelist", repositoryWhitelistRoutes);

// エラーハンドリング強化
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);

    // エラー応答の構造化
    const statusCode = err.statusCode || 500;
    const message = err.message || "サーバーエラーが発生しました";

    res.status(statusCode).json({
      success: false,
      message: message,
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
);

// サーバー起動
startServer();

// エクスポート（テスト用）
export { app, AppDataSource };
