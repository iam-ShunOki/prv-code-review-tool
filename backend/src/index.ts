import "reflect-metadata";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";

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

// サーバー起動関数
async function startServer() {
  try {
    // データベース接続
    await AppDataSource.initialize();
    console.log("データベースに接続しました");

    // ルートルートのセットアップ
    app.get("/", (req, res) => {
      res.json({ message: "コードレビューツール API サーバー" });
    });

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
app.use("/api/auth", authRoutes);
// 他のルートは後で実装
app.use("/api/reviews", reviewRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/queue", queueRoutes);

// エラーハンドリングミドルウェア
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).send("サーバーエラーが発生しました");
  }
);

// サーバー起動
startServer();

// エクスポート（テスト用）
export { app, AppDataSource };
