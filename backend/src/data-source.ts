import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./models/User";
import { Project } from "./models/Project";
import { UserProject } from "./models/UserProject";
import { UserGroup } from "./models/UserGroup";
import { UserGroupMember } from "./models/UserGroupMember";
import { Review } from "./models/Review";
import { CodeSubmission } from "./models/CodeSubmission";
import { Feedback } from "./models/Feedback";
import { Evaluation } from "./models/Evaluation";
import { CodeEmbedding } from "./models/CodeEmbedding";
import { Session } from "./models/Session";
import dotenv from "dotenv";
import { NotificationSettings } from "./models/NotificationSettings";
import { BacklogRepository } from "./models/BacklogRepository";
import { PullRequestTracker } from "./models/PullRequestTracker";
import { UsageLimit } from "./models/UsageLimit";
import { UsageLog } from "./models/UsageLog";
import { EvaluationCriteria } from "./models/EvaluationCriteria";
import { ChatMessage } from "./models/ChatMessage";
import { YearlyCriteriaSetting } from "./models/YearlyCriteriaSetting";
import { AcademicYearSetting } from "./models/AcademicYearSetting";
import { InitialSchema1625000000000 } from "./migrations/1625000000000-InitialSchema";
import { AddSessionsTable1625000000100 } from "./migrations/1625000000100-AddSessionsTable";
import { AddNotificationSettingsTable1625000000200 } from "./migrations/1625000000200-AddNotificationSettingsTable";
import { CreateTestData1625000000300 } from "./migrations/1625000000300-CreateTestData";
import { AddFeedbackStatusColumn1625000000400 } from "./migrations/1625000000400-AddFeedbackStatusColumn";
import { AddBacklogRepositoriesTable1625000000500 } from "./migrations/1625000000500-AddBacklogRepositoriesTable";
import { AddBacklogPrTracking1625000000600 } from "./migrations/1625000000600-AddBacklogPrTracking";
import { AddFeedbackReferenceUrl1625000000700 } from "./migrations/1625000000700-AddFeedbackReferenceUrl";
import { AddUsageLimitsAndLogs1625000000800 } from "./migrations/1625000000800-AddUsageLimitsAndLogs";
import { AddProjectAndGroupManagement1625000000900 } from "./migrations/1625000000900-AddProjectAndGroupManagement";
import { RemoveLineNumber1625000001000 } from "./migrations/1625000001000-RemoveLineNumber";
import { AddCodeSnippetToFeedback1625000001100 } from "./migrations/1625000001100-AddCodeSnippetToFeedback";
import { CreateEvaluationCriteria1625000001200 } from "./migrations/1625000001200-CreateEvaluationCriteria";
import { CreateChatMessagesTable1625000001300 } from "./migrations/1625000001300-CreateChatMessagesTable";
import { AddSessionIdToChatMessages1625000001400 } from "./migrations/1625000001400-AddSessionIdToChatMessages";
import { CreateFeedbackChecklistFields1625000001500 } from "./migrations/1625000001500-CreateFeedbackChecklistFields";
import { CreateYearlyCriteriaSettings1625000001600 } from "./migrations/1625000001600-CreateYearlyCriteriaSettings";
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
    Project,
    UserProject,
    UserGroup,
    UserGroupMember,
    Review,
    CodeSubmission,
    Feedback,
    Evaluation,
    CodeEmbedding,
    Session,
    NotificationSettings,
    BacklogRepository,
    PullRequestTracker,
    UsageLimit,
    UsageLog,
    EvaluationCriteria,
    ChatMessage,
    YearlyCriteriaSetting,
    AcademicYearSetting,
  ],
  migrations: [
    InitialSchema1625000000000,
    AddSessionsTable1625000000100,
    AddNotificationSettingsTable1625000000200,
    CreateTestData1625000000300,
    AddFeedbackStatusColumn1625000000400,
    AddBacklogRepositoriesTable1625000000500,
    AddBacklogPrTracking1625000000600,
    AddFeedbackReferenceUrl1625000000700,
    AddUsageLimitsAndLogs1625000000800,
    AddProjectAndGroupManagement1625000000900,
    RemoveLineNumber1625000001000,
    AddCodeSnippetToFeedback1625000001100,
    CreateEvaluationCriteria1625000001200,
    CreateChatMessagesTable1625000001300,
    AddSessionIdToChatMessages1625000001400,
    CreateFeedbackChecklistFields1625000001500,
    CreateYearlyCriteriaSettings1625000001600,
  ],
  subscribers: [],

  // 接続プール設定の追加
  poolSize: process.env.TYPEORM_CONNECTION_POOL_SIZE
    ? parseInt(process.env.TYPEORM_CONNECTION_POOL_SIZE)
    : 10,
  connectTimeout: 20000,
  maxQueryExecutionTime: 10000,
  cache: {
    duration: 60000, // キャッシュ期間（ミリ秒）
  },
});
