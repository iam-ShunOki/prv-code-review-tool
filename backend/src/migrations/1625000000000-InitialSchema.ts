import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1625000000000 implements MigrationInterface {
    name = 'InitialSchema1625000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ユーザーテーブル
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'trainee') NOT NULL DEFAULT 'trainee',
                department VARCHAR(100),
                join_year INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // レビューテーブル
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // コード提出テーブル
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS code_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                review_id INT NOT NULL,
                code_content TEXT NOT NULL,
                expectation TEXT,
                status ENUM('submitted', 'reviewed', 'revised') NOT NULL DEFAULT 'submitted',
                version INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
            )
        `);

        // フィードバックテーブル
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                id INT AUTO_INCREMENT PRIMARY KEY,
                submission_id INT NOT NULL,
                problem_point TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                priority ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
                line_number INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_id) REFERENCES code_submissions(id) ON DELETE CASCADE
            )
        `);

        // 評価テーブル
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS evaluations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                submission_id INT NOT NULL,
                code_quality_score INT NOT NULL,
                readability_score INT NOT NULL,
                efficiency_score INT NOT NULL,
                best_practices_score INT NOT NULL,
                overall_level ENUM('A', 'B', 'C', 'D', 'E') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (submission_id) REFERENCES code_submissions(id) ON DELETE CASCADE
            )
        `);

        // ベクトル埋め込み情報テーブル
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS code_embeddings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                submission_id INT NOT NULL,
                embedding_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_id) REFERENCES code_submissions(id) ON DELETE CASCADE
            )
        `);

        // インデックス作成
        await queryRunner.query(`CREATE INDEX idx_users_email ON users(email)`);
        await queryRunner.query(`CREATE INDEX idx_reviews_user_id ON reviews(user_id)`);
        await queryRunner.query(`CREATE INDEX idx_code_submissions_review_id ON code_submissions(review_id)`);
        await queryRunner.query(`CREATE INDEX idx_feedback_submission_id ON feedback(submission_id)`);
        await queryRunner.query(`CREATE INDEX idx_evaluations_user_id ON evaluations(user_id)`);
        await queryRunner.query(`CREATE INDEX idx_evaluations_submission_id ON evaluations(submission_id)`);
        await queryRunner.query(`CREATE INDEX idx_code_embeddings_submission_id ON code_embeddings(submission_id)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // テーブル削除（逆順）
        await queryRunner.query(`DROP TABLE IF EXISTS code_embeddings`);
        await queryRunner.query(`DROP TABLE IF EXISTS evaluations`);
        await queryRunner.query(`DROP TABLE IF EXISTS feedback`);
        await queryRunner.query(`DROP TABLE IF EXISTS code_submissions`);
        await queryRunner.query(`DROP TABLE IF EXISTS reviews`);
        await queryRunner.query(`DROP TABLE IF EXISTS users`);
    }
}