# コードレビューツール

新入社員のプログラミング学習を促進するためのAI活用コードレビューツールです。AIを活用して詳細なコードレビューを行い、新入社員が自身のコードの問題点を理解し、改善する能力を養成するとともに、管理者が新入社員の成長を追跡・評価できる機能を提供します。

## システム概要

このアプリケーションは以下の特徴を持っています：

- AIを活用した詳細なコードレビュー
- 新入社員向けのコード改善フィードバック
- 管理者向けの評価・進捗管理機能
- Backlog連携による実プロジェクトへの反映

## 技術スタック

### フロントエンド
- TypeScript
- Next.js (App Router)
- Tailwind CSS
- shadcn UI
- React Query

### バックエンド
- Node.js
- Express.js
- TypeORM
- LangChain
- Chroma Vector DB

### データベース
- MySQL 8.0

### インフラ
- Docker & Docker Compose
- NGINX (リバースプロキシ)
- AWS (または同等のクラウドサービス)

## 開発環境のセットアップ

### 前提条件
- Docker と Docker Compose がインストールされていること
- Visual Studio Code がインストールされていること
- VS Code の Remote Development 拡張機能がインストールされていること

### セットアップ手順

1. リポジトリをクローン
   ```bash
   git clone https://github.com/yourusername/code-review-tool.git
   cd code-review-tool
   ```

2. 環境変数ファイルの作成
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. VS Code でフォルダを開き、Remote Container で開く
   ```
   VS Code > Remote Containers: Open Folder in Container
   ```

4. 開発サーバーの起動
   ```bash
   # コンテナ内で実行
   npm run dev
   ```

5. アプリケーションにアクセス
   - フロントエンド: http://localhost:3000
   - バックエンドAPI: http://localhost:3001
   - Chroma Vector DB: http://localhost:8000

## ディレクトリ構成

```
code-review-tool/
├── .devcontainer/                 # devcontainer設定
├── frontend/                      # Next.jsフロントエンド
│   ├── public/                    # 静的ファイル
│   ├── src/                       # ソースコード
│   │   ├── app/                   # App Router構造
│   │   ├── components/            # UIコンポーネント
│   │   ├── lib/                   # ユーティリティ関数
│   │   └── types/                 # TypeScript型定義
├── backend/                       # Express.jsバックエンド
│   ├── src/                       # ソースコード
│   │   ├── controllers/           # コントローラー
│   │   ├── models/                # データモデル
│   │   ├── routes/                # APIルート
│   │   ├── services/              # ビジネスロジック
│   │   ├── utils/                 # ユーティリティ関数
│   │   ├── ai/                    # AI関連機能
│   │   ├── backlog/               # Backlog連携
│   │   └── config/                # 環境設定
├── db/                            # データベース関連
├── vector-db/                     # ベクトルDB関連
└── docker/                        # 本番用Dockerファイル
```

## 開発フロー

1. 機能ブランチを作成: `feature/branch-name`
2. コードを実装
3. テストを実行: `npm run test`
4. プルリクエストを作成
5. コードレビュー後、マージ

## ライセンス

[MIT License](LICENSE)