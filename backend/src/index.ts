import "reflect-metadata";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import { PullRequestMonitoringService } from "./services/PullRequestMonitoringService";
import { WebhookUrlService } from "./services/WebhookUrlService";
import { RepositoryWhitelistService } from "./services/RepositoryWhitelistService";
import { ReviewFeedbackSenderService } from "./services/ReviewFeedbackSenderService";

// 環境変数の読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ミドルウェアの設定
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

/**
 * プルリクエストモニタリングの初期化
 */
async function initializePullRequestMonitoring() {
  try {
    console.log("=========================================");
    console.log("Initializing pull request monitoring...");
    console.log("=========================================");

    // ホワイトリストの初期化（先に実行）
    const whitelistService = RepositoryWhitelistService.getInstance();
    await whitelistService.initialize();

    // WebhookUrl初期化
    const webhookUrlService = WebhookUrlService.getInstance();
    console.log(
      `Current webhook base URL: ${webhookUrlService.getWebhookBaseUrl()}`
    );
    console.log(
      `Backlog webhook endpoint: ${webhookUrlService.getWebhookUrl(
        "/api/backlog/webhook"
      )}`
    );

    // 5秒待機してから実行（他の初期化処理が完了するのを待つ）
    console.log("Waiting 5 seconds before checking existing pull requests...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // プルリクエスト監視サービス初期化
    const monitoringService = new PullRequestMonitoringService();

    // 既存プルリクエストのチェック
    console.log("Starting check of existing pull requests...");
    const result = await monitoringService.checkExistingPullRequests();
    console.log(
      `Pull request check completed: processed ${result.processed} PRs, skipped ${result.skipped} PRs`
    );

    // 15分ごとに未送信のレビューフィードバックを送信
    console.log("Setting up feedback sender scheduler");
    setInterval(async () => {
      try {
        const feedbackSender = new ReviewFeedbackSenderService();
        const sendResult = await feedbackSender.sendPendingReviewFeedbacks();
        console.log(
          `Feedback sender ran: ${sendResult.success} sent, ${sendResult.failed} failed, ${sendResult.skipped} skipped`
        );
      } catch (error) {
        console.error("Error in feedback sender scheduler:", error);
      }
    }, 15 * 60 * 1000); // 15分ごと

    console.log("Pull request monitoring initialization completed");
  } catch (error) {
    console.error("Error initializing pull request monitoring:", error);
  }
}

/**
 * サーバー起動関数
 */
async function startServer() {
  try {
    // データベース接続
    await AppDataSource.initialize();
    console.log("Database connection established");

    // マイグレーションの実行（必要に応じて）
    // await AppDataSource.runMigrations();
    // console.log("Database migrations applied");

    // リポジトリホワイトリストを初期化
    await RepositoryWhitelistService.getInstance().initialize();
    console.log("Repository whitelist initialized");

    // ルートルートのセットアップ（省略）...

    // サーバー起動
    app.listen(PORT, () => {
      console.log(`Server started: http://localhost:${PORT}`);

      // サーバー起動後にバックグラウンドでプルリクエストモニタリングを初期化
      setTimeout(() => {
        initializePullRequestMonitoring().catch((error) => {
          console.error(
            "Error in delayed pull request monitoring initialization:",
            error
          );
        });
      }, 2000);
    });
  } catch (error) {
    console.error("Server startup error:", error);
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
import aiChatRoutes from "./routes/aiChatRoutes";

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
app.use("/api/ai-chat", aiChatRoutes);

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
