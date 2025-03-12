## Webhookテスト環境のセットアップ

### ngrokの使用

ローカル開発環境でBacklogからのWebhookを受け取るには、[ngrok](https://ngrok.com/)を使用して一時的な公開URLを取得します。

#### 1. ngrokのインストールは不要

このプロジェクトではngrokがすでに開発依存関係に含まれています。追加のインストールは必要ありません。

#### 2. ngrokの認証設定（初回のみ）

ngrokを初めて使用する際は、アカウント登録とAuthトークンの設定が必要です：

```bash
# ngrok.comでアカウントを作成し、Authトークンを取得したら：
npm run setup-ngrok <あなたのAuthトークン>
```

このセットアップスクリプトは自動的にngrokのバージョンを検出し、適切なコマンドでAuthトークンを設定します。

#### 3. ngrokの実行

バックエンドサーバーが3001ポートで動いているため、以下のコマンドでngrokを起動できます：

```bash
# ngrokのみ起動
npm run ngrok

# または、開発サーバーとngrokを同時起動
npm run dev:with-ngrok
```

これにより、一時的な公開URL（例：`https://xxxx-xx-xx-xxx-xx.ngrok-free.app`）が生成されます。

#### 4. Webhook URLの自動検出

ngrokを実行した後、以下のコマンドでWebhook URLを自動検出しシステムに設定できます：

```bash
npm run detect-ngrok
```

このスクリプトは：
- ngrokの公開URLを検出
- Webhook URLをシステムに設定
- BacklogのWebhook設定方法を表示

#### 5. Backlogでの設定

1. Backlogのプロジェクト設定 > Webhooksに移動
2. 新しいWebhookを追加
   - URL: `https://xxxx-xx-xx-xxx-xx.ngrok-free.app/api/backlog/webhook`
   - トリガー: 「プルリクエスト作成」「プルリクエスト更新」を選択

#### 6. 管理画面での確認・テスト

管理画面から：
1. 「Webhook管理」 > 「Webhook設定」に移動
2. 現在のngrok URLが表示されていることを確認
3. 「テストWebhookを送信」ボタンでテスト

これでローカル開発環境でBacklogのWebhookを受信し、@codereviewメンションを含むプルリクエストを自動的に処理できるようになります。

詳細なセットアップ方法は[ngrokセットアップガイド](./docs/ngrok-setup-guide.md)を参照してください。