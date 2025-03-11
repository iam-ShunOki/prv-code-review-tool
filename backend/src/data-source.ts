import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./models/User";
import { Review } from "./models/Review";
import { CodeSubmission } from "./models/CodeSubmission";
import { Feedback } from "./models/Feedback";
import { Evaluation } from "./models/Evaluation";
import { CodeEmbedding } from "./models/CodeEmbedding";
import { Session } from "./models/Session";
import { InitialSchema1625000000000 } from "./migrations/1625000000000-InitialSchema";
import { AddSessionsTable1625000000100 } from "./migrations/1625000000100-AddSessionsTable";
import { AddNotificationSettingsTable1625000000200 } from "./migrations/1625000000200-AddNotificationSettingsTable";
import dotenv from "dotenv";

// 環境変数の読み込み
dotenv.config();

export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.MYSQL_HOST || "localhost",
  port: 3306,
  username: process.env.MYSQL_USER || "codereviewer",
  password: process.env.MYSQL_PASSWORD || "reviewpassword",
  database: process.env.MYSQL_DATABASE || "codereview",
  synchronize: false, // マイグレーションを使うのでfalseに設定
  logging: process.env.NODE_ENV === "development",
  entities: [
    User,
    Review,
    CodeSubmission,
    Feedback,
    Evaluation,
    CodeEmbedding,
    Session,
  ],
  migrations: [
    InitialSchema1625000000000,
    AddSessionsTable1625000000100,
    AddNotificationSettingsTable1625000000200,
  ],
  subscribers: [],
});
