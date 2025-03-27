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

// ヘルスチェックエンドポイント
app.get("/health", (req, res) => {
  // データベース接続の確認
  const dbStatus = AppDataSource.isInitialized ? "connected" : "disconnected";

  // メモリ使用量の確認
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };

  // 応答時間の測定
  const startTime = process.hrtime();
  const elapsedTime = process.hrtime(startTime);
  const responseTimeMs = elapsedTime[0] * 1000 + elapsedTime[1] / 1000000;

  // 正常なら200、問題があれば503を返す
  if (dbStatus === "connected" && memoryUsageMB.heapUsed < 3000) {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: dbStatus,
      memory: memoryUsageMB,
      responseTime: responseTimeMs.toFixed(2) + "ms",
    });
  } else {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      database: dbStatus,
      memory: memoryUsageMB,
      responseTime: responseTimeMs.toFixed(2) + "ms",
    });
  }
});

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
    // データベース接続試行
    try {
      await AppDataSource.initialize();
      console.log("Database connection established");

      // マイグレーションの実行（必要に応じて）
      try {
        await AppDataSource.runMigrations();
        console.log("Database migrations applied successfully");
      } catch (migrationError) {
        console.error("Migration error:", migrationError);
        // マイグレーションエラーでもサーバーは起動する
      }
    } catch (dbError) {
      console.error("Database connection error:", dbError);
      // データベース接続エラーでもサーバーは起動（機能制限付き）
    }

    // 必須テーブルの存在確認と初期データの投入
    try {
      await initializeBasicData();
    } catch (initError) {
      console.error("Data initialization error:", initError);
    }

    // リポジトリホワイトリストを初期化
    try {
      await RepositoryWhitelistService.getInstance().initialize();
      console.log("Repository whitelist initialized");
    } catch (whitelistError) {
      console.error(
        "Repository whitelist initialization error:",
        whitelistError
      );
    }

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

/**
 * 基本データの初期化
 */
async function initializeBasicData() {
  // usage_limits テーブルの存在を確認
  try {
    const tableExists = await checkTableExists("usage_limits");
    if (!tableExists) {
      console.warn(
        "usage_limits table does not exist. Migrations may not have been run."
      );
      return;
    }

    // レコードの有無を確認
    const existingLimits = await AppDataSource.getRepository(
      "usage_limits"
    ).find();
    if (existingLimits && existingLimits.length > 0) {
      console.log("Usage limits already exist in the database");
      return;
    }

    // 初期データの投入
    console.log("Inserting initial usage limits data");
    await AppDataSource.query(`
      INSERT INTO usage_limits (feature_key, daily_limit, description, is_active)
      VALUES 
        ('code_review', 20, 'AIコードレビュー依頼の1日あたりの制限回数', true),
        ('ai_chat', 30, 'AIチャットボットの1日あたりの制限回数', true)
    `);
    console.log("Initial usage limits data inserted successfully");
  } catch (error) {
    console.error("Error initializing basic data:", error);
    // エラーは呼び出し元で処理
    throw error;
  }
}

/**
 * テーブルが存在するかチェック
 */
async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const query = `
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = ?
    `;

    const result = await AppDataSource.query(query, [tableName]);
    return result.length > 0;
  } catch (error) {
    console.error(`Table existence check error (${tableName}):`, error);
    return false;
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
import usageLimitRoutes from "./routes/usageLimitRoutes";
import projectRoutes from "./routes/projectRoutes";
import groupRoutes from "./routes/groupRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import chatRoutes from "./routes/chatRoutes";
import learningChatRoutes from "./routes/learningChatRoutes";
import evaluationCriteriaRoutes from "./routes/evaluationCriteriaRoutes";
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
app.use("/api/usage-limits", usageLimitRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/learning-chat", learningChatRoutes);
app.use("/api/evaluation-criteria", evaluationCriteriaRoutes);
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
