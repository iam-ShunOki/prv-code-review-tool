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
import { BacklogService } from "./services/BacklogService";
import { MentionDetectionService } from "./services/MentionDetectionService";

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
    console.log("プルリクエストモニタリングを初期化しています...");
    console.log("=========================================");

    // ホワイトリストの初期化
    const whitelistService = RepositoryWhitelistService.getInstance();
    await whitelistService.initialize();

    // WebhookUrl初期化
    const webhookUrlService = WebhookUrlService.getInstance();
    console.log(
      `現在のwebhookベースURL: ${webhookUrlService.getWebhookBaseUrl()}`
    );
    console.log(
      `Backlog webhookエンドポイント: ${webhookUrlService.getWebhookUrl(
        "/api/backlog/webhook"
      )}`
    );

    // 既存プルリクエストの初回チェック
    await checkAllPullRequests();

    // 3分間隔での定期チェックの設定
    const CHECK_INTERVAL_MS = 1 * 60 * 1000; // 1分
    console.log(
      `プルリクエスト定期チェックを設定: ${CHECK_INTERVAL_MS / 60000}分間隔`
    );

    setInterval(async () => {
      try {
        console.log(
          "定期チェック実行: プルリクエストの未処理@codereviewをスキャン中..."
        );
        await checkAllPullRequests();
      } catch (error) {
        console.error("定期チェック処理中にエラーが発生しました:", error);
      }
    }, CHECK_INTERVAL_MS);

    console.log("プルリクエストモニタリングの初期化が完了しました");
  } catch (error) {
    console.error(
      "プルリクエストモニタリングの初期化中にエラーが発生しました:",
      error
    );
  }
}

/**
 * 全プルリクエストのチェック実行関数
 * ホワイトリストに含まれるリポジトリのオープンPRをスキャンし、
 * 未処理の@codereviewメンションがあれば処理する
 */
async function checkAllPullRequests(): Promise<void> {
  // スキャン開始時間を記録
  const startTime = new Date();
  console.log(`全プルリクエストスキャン開始: ${startTime.toISOString()}`);

  let processed = 0;
  let skipped = 0;

  try {
    // サービスの初期化
    const whitelistService = RepositoryWhitelistService.getInstance();
    const backlogService = new BacklogService();
    const mentionDetectionService = new MentionDetectionService();
    const monitoringService = new PullRequestMonitoringService();

    // ホワイトリストからリポジトリを取得
    const whitelist = await whitelistService.getWhitelist();

    // 自動返信が許可されているリポジトリのみに絞り込み
    const autoReplyRepos = whitelist.filter((repo) => repo.allowAutoReply);
    console.log(`チェック対象リポジトリ: ${autoReplyRepos.length}件`);

    // 各リポジトリに対して処理
    for (const repo of autoReplyRepos) {
      try {
        // オープン状態のプルリクエスト一覧を取得
        const pullRequests = await backlogService.getPullRequests(
          repo.projectKey,
          repo.repositoryName,
          1 // オープン状態
        );

        if (pullRequests.length === 0) {
          continue; // オープンPRがなければ次のリポジトリへ
        }

        console.log(
          `リポジトリ ${repo.projectKey}/${repo.repositoryName}: ${pullRequests.length}件のオープンPR`
        );

        // 各PRをチェック
        for (const pr of pullRequests) {
          try {
            // PRのコメントを取得
            const comments = await backlogService.getPullRequestComments(
              repo.projectKey,
              repo.repositoryName,
              pr.number
            );

            // @codereviewメンションがあるかチェック
            const hasMentionInDescription =
              pr.description &&
              mentionDetectionService.detectCodeReviewMention(pr.description);

            const commentsWithMention = comments.filter(
              (comment) =>
                comment.content &&
                mentionDetectionService.detectCodeReviewMention(comment.content)
            );

            if (hasMentionInDescription || commentsWithMention.length > 0) {
              // 処理実行
              const result = await monitoringService.checkSinglePullRequest(
                repo.projectKey,
                repo.repositoryName,
                pr.number
              );

              if (result) {
                processed++;
                console.log(
                  `PR #${pr.number} (${repo.projectKey}/${repo.repositoryName}): レビュー実行済み`
                );
              } else {
                skipped++;
                console.log(
                  `PR #${pr.number} (${repo.projectKey}/${repo.repositoryName}): スキップ (既に処理済み)`
                );
              }
            }
          } catch (prError) {
            console.error(
              `PR #${pr.number} (${repo.projectKey}/${repo.repositoryName}) の処理中にエラー:`,
              prError
            );
            skipped++;
          }
        }
      } catch (repoError) {
        console.error(
          `リポジトリ ${repo.projectKey}/${repo.repositoryName} の処理中にエラー:`,
          repoError
        );
      }
    }
  } catch (error) {
    console.error("プルリクエストスキャン中にエラーが発生しました:", error);
  }

  // 処理時間の計算
  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  console.log(
    `全プルリクエストスキャン完了: 処理=${processed}件, スキップ=${skipped}件, 所要時間=${
      durationMs / 1000
    }秒`
  );
}

/**
 * サーバー起動関数
 */
async function startServer() {
  try {
    // データベース接続試行
    try {
      await AppDataSource.initialize();
      console.log("データベース接続確立");

      // マイグレーションの実行（必要に応じて）
      try {
        await AppDataSource.runMigrations();
        console.log("データベースマイグレーションが正常に適用されました");
      } catch (migrationError) {
        console.error("マイグレーションエラー:", migrationError);
        // マイグレーションエラーでもサーバーは起動する
      }
    } catch (dbError) {
      console.error("データベース接続エラー:", dbError);
      // データベース接続エラーでもサーバーは起動（機能制限付き）
    }

    // 必須テーブルの存在確認と初期データの投入
    try {
      await initializeBasicData();
    } catch (initError) {
      console.error("データ初期化エラー:", initError);
    }

    // リポジトリホワイトリストを初期化
    try {
      await RepositoryWhitelistService.getInstance().initialize();
      console.log("リポジトリホワイトリストが初期化されました");
    } catch (whitelistError) {
      console.error("リポジトリホワイトリスト初期化エラー:", whitelistError);
    }

    // サーバー起動
    app.listen(PORT, () => {
      console.log(`サーバー起動: http://localhost:${PORT}`);

      // サーバー起動後にバックグラウンドでプルリクエストモニタリングを初期化
      setTimeout(() => {
        initializePullRequestMonitoring().catch((error) => {
          console.error(
            "遅延プルリクエストモニタリング初期化でエラーが発生しました:",
            error
          );
        });
      }, 2000);
    });
  } catch (error) {
    console.error("サーバー起動エラー:", error);
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
