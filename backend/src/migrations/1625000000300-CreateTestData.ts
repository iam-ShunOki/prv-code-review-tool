// backend/src/migrations/1625000000300-CreateTestData.ts
import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from "bcrypt";
import { UserRole } from "../models/User";
import { ReviewStatus } from "../models/Review";
import { SubmissionStatus } from "../models/CodeSubmission";
import { FeedbackPriority } from "../models/Feedback";
import { SkillLevel } from "../models/Evaluation";

export class CreateTestData1625000000300 implements MigrationInterface {
  name = "CreateTestData1625000000300";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // パスワードのハッシュ化関数
    const hashPassword = async (password: string): Promise<string> => {
      return bcrypt.hash(password, 10);
    };

    // 現在の日時
    const now = new Date();

    // 日本人の姓のリスト
    const lastNames = [
      "佐藤",
      "鈴木",
      "高橋",
      "田中",
      "伊藤",
      "渡辺",
      "山本",
      "中村",
      "小林",
      "加藤",
      "吉田",
      "山田",
      "佐々木",
      "山口",
      "松本",
      "井上",
      "木村",
      "林",
      "斎藤",
      "清水",
      "山崎",
      "森",
      "池田",
      "橋本",
      "阿部",
    ];

    // 日本人の名のリスト (男性)
    const maleFirstNames = [
      "大輔",
      "直樹",
      "健太",
      "翔太",
      "拓也",
      "健",
      "哲也",
      "和也",
      "達也",
      "亮",
      "航",
      "豊",
      "健太郎",
      "大樹",
      "隆",
      "大介",
      "大輝",
      "大地",
      "悠太",
      "裕太",
    ];

    // 日本人の名のリスト (女性)
    const femaleFirstNames = [
      "美咲",
      "詩織",
      "萌",
      "恵",
      "愛",
      "明日香",
      "彩",
      "優子",
      "千尋",
      "麻衣",
      "由美子",
      "裕子",
      "直美",
      "舞",
      "菜々子",
      "真由美",
      "香織",
      "智子",
      "純子",
      "美穂",
    ];

    // ランダムな日本人名を生成する関数
    const generateRandomJapaneseName = (): string => {
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const isMale = Math.random() > 0.5;
      const firstNameArray = isMale ? maleFirstNames : femaleFirstNames;
      const firstName =
        firstNameArray[Math.floor(Math.random() * firstNameArray.length)];
      return `${lastName} ${firstName}`;
    };

    // 部署一覧
    const departments = [
      "フロントエンド開発部",
      "バックエンド開発部",
      "インフラ部",
      "データベース部",
      "QA部",
      "モバイルアプリ開発部",
      "UI/UXデザイン部",
      "プロジェクト管理部",
    ];

    // ランダムな日付を取得する関数（start日からend日の間）
    const randomDate = (start: Date, end: Date): Date => {
      return new Date(
        start.getTime() + Math.random() * (end.getTime() - start.getTime())
      );
    };

    // 日付から指定された日数を引いた日付を取得
    const daysAgo = (days: number): Date => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date;
    };

    // 1. 管理者ユーザーの作成 (2名)
    console.log("Creating admin users...");
    const adminPassword = await hashPassword("admin123");

    await queryRunner.query(`
      INSERT INTO users 
        (name, email, password, role, department, join_year, created_at, updated_at)
      VALUES
        ('山田 太郎', 'admin1@example.com', '${adminPassword}', '${UserRole.ADMIN}', 'プロジェクト管理部', 2020, NOW(), NOW()),
        ('佐藤 次郎', 'admin2@example.com', '${adminPassword}', '${UserRole.ADMIN}', 'プロジェクト管理部', 2021, NOW(), NOW())
    `);

    // 2. 新入社員ユーザーの作成 (18名)
    console.log("Creating trainee users...");
    const traineePassword = await hashPassword("trainee123");

    // 過去3年度の新入社員を作成
    const years = [2023, 2024, 2025];

    // 3年分の社員データを生成、各年6名ずつで計18名
    for (let year of years) {
      for (let i = 1; i <= 6; i++) {
        const department =
          departments[Math.floor(Math.random() * departments.length)];
        const userId = (year - 2020) * 10 + i;
        const name = generateRandomJapaneseName();

        await queryRunner.query(`
          INSERT INTO users 
            (name, email, password, role, department, join_year, created_at, updated_at)
          VALUES
            ('${name}', 'trainee${userId}@example.com', '${traineePassword}', '${UserRole.TRAINEE}', '${department}', ${year}, NOW(), NOW())
        `);
      }
    }

    // 3. ユーザーIDを取得
    const userIds = await queryRunner.query(
      `SELECT id FROM users WHERE role = '${UserRole.TRAINEE}'`
    );

    // 4. レビュー、コード提出、フィードバック、評価データを作成
    console.log("Creating review data for each trainee...");

    // レビュータイトル候補
    const reviewTitles = [
      "ユーザー認証機能の実装",
      "データ一覧表示機能",
      "検索機能の実装",
      "グラフ表示コンポーネント",
      "APIリクエストクラス",
      "ファイル操作ユーティリティ",
      "レポート生成機能",
      "バッチ処理システム",
      "ログ分析ツール",
      "設定画面の実装",
      "データ同期機能",
      "通知システム",
      "メール送信クラス",
    ];

    // コード提出内容サンプル
    const codeSamples = [
      // Javascriptサンプル
      `function authenticate(username, password) {
  // バリデーション不足
  if (username && password) {
    return database.query(\`SELECT * FROM users WHERE username='\${username}' AND password='\${password}'\`);
  }
  return null;
}`,
      // Reactサンプル
      `function UserList() {
  const [users, setUsers] = useState([]);
  
  // useEffectの依存配列が不適切
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data));
  });
  
  return (
    <div>
      {users.map(user => <div>{user.name}</div>)}
    </div>
  );
}`,
      // バックエンドサンプル
      `app.post('/api/data', (req, res) => {
  const data = req.body;
  // バリデーションなしで直接データベースに挿入
  db.collection('items').insertOne(data)
    .then(() => res.status(200).send('Success'))
    .catch(err => res.status(500).send('Error'));
});`,
    ];

    // フィードバックサンプル
    const feedbackSamples = [
      {
        problem: "セキュリティリスク: SQLインジェクションの可能性",
        suggestion:
          "パラメータ化クエリを使用して、ユーザー入力を直接SQLクエリに結合することを避けてください。代わりにプリペアドステートメントを使用しましょう。",
        priority: FeedbackPriority.HIGH,
      },
      {
        problem: "パフォーマンス問題: 不要な再レンダリング",
        suggestion:
          "useEffectの依存配列を適切に設定して、不要な再レンダリングを防ぎましょう。このケースでは空の配列を指定するべきです。",
        priority: FeedbackPriority.MEDIUM,
      },
      {
        problem: "バリデーション不足",
        suggestion:
          "ユーザー入力は常にバリデーションを行ってから処理してください。入力が予期しない形式の場合にエラーメッセージを表示することを検討してください。",
        priority: FeedbackPriority.HIGH,
      },
      {
        problem: "エラーハンドリングの改善が必要",
        suggestion:
          "より具体的なエラーメッセージを提供し、ユーザーがどのように問題を解決できるかを明確にしてください。",
        priority: FeedbackPriority.MEDIUM,
      },
      {
        problem: "コードの可読性が低い",
        suggestion:
          "変数名や関数名をより明確にし、複雑なロジックには適切なコメントを追加してください。",
        priority: FeedbackPriority.LOW,
      },
      {
        problem: "ハードコードされた値の使用",
        suggestion:
          "マジックナンバーやハードコードされた文字列は定数として定義し、一箇所で管理できるようにしましょう。",
        priority: FeedbackPriority.MEDIUM,
      },
      {
        problem: "冗長なコード",
        suggestion:
          "同じ処理が複数回書かれています。共通の関数に抽出して再利用性を高めましょう。",
        priority: FeedbackPriority.LOW,
      },
    ];

    // 各ユーザーに対してレビュー、提出、フィードバックを作成
    for (const userObj of userIds) {
      const userId = userObj.id;

      // 1-3個のレビューを作成
      const reviewCount = Math.floor(Math.random() * 3) + 1;

      for (let i = 0; i < reviewCount; i++) {
        // レビュータイトルをランダムに選択
        const titleIndex = Math.floor(Math.random() * reviewTitles.length);
        const title = reviewTitles[titleIndex];
        const description = `${title}に関するコードレビュー依頼です。`;

        // レビューのステータスをランダムに決定
        const statusOptions = Object.values(ReviewStatus);
        const status =
          statusOptions[Math.floor(Math.random() * statusOptions.length)];

        // レビュー作成日時（過去90日以内）
        const createdAt = randomDate(daysAgo(90), now);
        const updatedAt = randomDate(createdAt, now);

        // レビューを作成
        const reviewResult = await queryRunner.query(`
          INSERT INTO reviews 
            (user_id, title, description, status, created_at, updated_at)
          VALUES
            (${userId}, '${title}', '${description}', '${status}', '${createdAt
          .toISOString()
          .slice(0, 19)
          .replace("T", " ")}', '${updatedAt
          .toISOString()
          .slice(0, 19)
          .replace("T", " ")}')
        `);

        const reviewId = reviewResult.insertId;

        // 1-3個の提出を作成
        const submissionCount = Math.floor(Math.random() * 3) + 1;

        for (let j = 0; j < submissionCount; j++) {
          // コードサンプルをランダムに選択
          const codeIndex = Math.floor(Math.random() * codeSamples.length);
          const code = codeSamples[codeIndex];
          const expectation =
            "正しく動作するコードを目指しています。セキュリティやパフォーマンスの観点からレビューをお願いします。";

          // 提出のステータスをランダムに決定
          const subStatusOptions = Object.values(SubmissionStatus);
          const subStatus =
            subStatusOptions[
              Math.floor(Math.random() * subStatusOptions.length)
            ];

          // バージョン
          const version = j + 1;

          // 提出日時（レビュー作成日以降）
          const subCreatedAt = randomDate(createdAt, now);

          // 提出を作成
          const submissionResult = await queryRunner.query(
            `
            INSERT INTO code_submissions 
              (review_id, code_content, expectation, status, version, created_at)
            VALUES
              (${reviewId}, ?, '${expectation}', '${subStatus}', ${version}, '${subCreatedAt
              .toISOString()
              .slice(0, 19)
              .replace("T", " ")}')
          `,
            [code]
          );

          const submissionId = submissionResult.insertId;

          // 提出が「reviewed」状態の場合、フィードバックを追加
          if (
            subStatus === SubmissionStatus.REVIEWED ||
            subStatus === SubmissionStatus.REVISED
          ) {
            // 2-5個のフィードバックを作成
            const feedbackCount = Math.floor(Math.random() * 4) + 2;

            // すでに使用したフィードバック索引を追跡
            const usedFeedbackIndices = new Set();

            for (let k = 0; k < feedbackCount; k++) {
              // まだ使用していないフィードバックサンプルをランダムに選択
              let feedbackIndex;
              do {
                feedbackIndex = Math.floor(
                  Math.random() * feedbackSamples.length
                );
              } while (
                usedFeedbackIndices.has(feedbackIndex) &&
                usedFeedbackIndices.size < feedbackSamples.length
              );

              usedFeedbackIndices.add(feedbackIndex);
              const feedback = feedbackSamples[feedbackIndex];

              // ランダムな行番号（1-20）
              const lineNumber = Math.floor(Math.random() * 20) + 1;

              // フィードバック作成日時（提出日以降）
              const feedbackCreatedAt = randomDate(subCreatedAt, now);

              // フィードバックを作成
              await queryRunner.query(
                `
                INSERT INTO feedback 
                  (submission_id, problem_point, suggestion, priority, line_number, created_at)
                VALUES
                  (${submissionId}, ?, ?, '${
                  feedback.priority
                }', ${lineNumber}, '${feedbackCreatedAt
                  .toISOString()
                  .slice(0, 19)
                  .replace("T", " ")}')
              `,
                [feedback.problem, feedback.suggestion]
              );
            }

            // 評価を作成
            // ランダムなスコア（50-100）
            const codeQualityScore = Math.floor(Math.random() * 51) + 50;
            const readabilityScore = Math.floor(Math.random() * 51) + 50;
            const efficiencyScore = Math.floor(Math.random() * 51) + 50;
            const bestPracticesScore = Math.floor(Math.random() * 51) + 50;

            // 平均スコアに基づいてレベルを決定
            const avgScore =
              (codeQualityScore +
                readabilityScore +
                efficiencyScore +
                bestPracticesScore) /
              4;
            let level: SkillLevel;
            if (avgScore >= 90) level = SkillLevel.A;
            else if (avgScore >= 80) level = SkillLevel.B;
            else if (avgScore >= 70) level = SkillLevel.C;
            else if (avgScore >= 60) level = SkillLevel.D;
            else level = SkillLevel.E;

            // 評価作成日時（フィードバック後）
            const evaluationCreatedAt = randomDate(subCreatedAt, now);

            // 評価を作成
            await queryRunner.query(`
              INSERT INTO evaluations 
                (user_id, submission_id, code_quality_score, readability_score, efficiency_score, best_practices_score, overall_level, created_at)
              VALUES
                (${userId}, ${submissionId}, ${codeQualityScore}, ${readabilityScore}, ${efficiencyScore}, ${bestPracticesScore}, '${level}', '${evaluationCreatedAt
              .toISOString()
              .slice(0, 19)
              .replace("T", " ")}')
            `);
          }
        }
      }

      // 通知設定を作成
      await queryRunner.query(`
        INSERT INTO notification_settings 
          (user_id, email_notifications, review_completed, feedback_received, level_changed, system_notifications, created_at, updated_at)
        VALUES
          (${userId}, true, true, true, true, true, NOW(), NOW())
      `);
    }

    console.log("Test data creation completed!");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // テストデータを削除
    console.log("Removing test data...");

    // 評価データの削除
    await queryRunner.query(`DELETE FROM evaluations`);

    // フィードバックデータの削除
    await queryRunner.query(`DELETE FROM feedback`);

    // コード提出データの削除
    await queryRunner.query(`DELETE FROM code_submissions`);

    // レビューデータの削除
    await queryRunner.query(`DELETE FROM reviews`);

    // 通知設定の削除
    await queryRunner.query(`DELETE FROM notification_settings`);

    // 管理者と研修生ユーザーの削除
    await queryRunner.query(
      `DELETE FROM users WHERE role IN ('${UserRole.ADMIN}', '${UserRole.TRAINEE}')`
    );

    console.log("Test data removal completed!");
  }
}
