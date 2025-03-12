#!/usr/bin/env node

/**
 * ngrok接続をテストし、Webhook URLを自動更新するスクリプト
 *
 * 使用方法:
 * 1. npm install axios
 * 2. node scripts/detect-ngrok.js
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// 設定
const NGROK_API_URL = "http://localhost:4040/api/tunnels";
const WEBHOOK_STORAGE_PATH = path.join(__dirname, "../.webhook-url");
const SERVER_PORT = process.env.PORT || 3001;

/**
 * ngrokの公開URLを検出
 */
async function detectNgrokUrl() {
  try {
    console.log("Attempting to detect ngrok tunnel...");
    const response = await axios.get(NGROK_API_URL);
    const tunnels = response.data.tunnels;

    // HTTPSのトンネルを探す
    const httpsTunnel = tunnels.find(
      (tunnel) =>
        tunnel.proto === "https" && tunnel.public_url.includes("ngrok")
    );

    if (httpsTunnel) {
      const ngrokUrl = httpsTunnel.public_url;
      console.log(`✅ ngrok tunnel detected: ${ngrokUrl}`);

      // URLを保存
      fs.writeFileSync(WEBHOOK_STORAGE_PATH, ngrokUrl);
      console.log(`✅ Webhook URL saved to ${WEBHOOK_STORAGE_PATH}`);

      console.log("\nBacklog Webhook URL:");
      console.log(`${ngrokUrl}/api/backlog/webhook`);
      console.log("\nConfiguration Instructions:");
      console.log("1. Go to your Backlog project settings");
      console.log("2. Navigate to the Webhooks section");
      console.log("3. Add a new webhook with the URL above");
      console.log(
        '4. Select "Pull Request Create" and "Pull Request Update" triggers'
      );

      return ngrokUrl;
    } else {
      console.log("❌ No HTTPS ngrok tunnel found");
      return null;
    }
  } catch (error) {
    console.error("❌ Error detecting ngrok tunnel:", error.message);
    console.log("\nIs ngrok running? Start it with:");
    console.log(`ngrok http ${SERVER_PORT}`);
    return null;
  }
}

/**
 * 既存のWebhookサーバーに更新リクエストを送信
 */
async function updateServerWebhookUrl(ngrokUrl) {
  try {
    console.log("\nAttempting to update webhook URL in running server...");

    // ログイン（実際のシステムに合わせて認証情報を設定）
    const loginResponse = await axios.post(
      `http://localhost:${SERVER_PORT}/api/auth/login`,
      {
        email: "admin@example.com",
        password: "password",
      }
    );

    const token = loginResponse.data.data.sessionToken;

    // Webhook URLを更新
    const updateResponse = await axios.post(
      `http://localhost:${SERVER_PORT}/api/webhooks/url`,
      { url: ngrokUrl },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("✅ Server webhook URL updated successfully");
    return true;
  } catch (error) {
    console.log("❌ Could not update server webhook URL:", error.message);
    console.log(
      "Is the server running? You may need to update the URL manually in the admin panel."
    );
    return false;
  }
}

// スクリプト実行
async function main() {
  const ngrokUrl = await detectNgrokUrl();

  if (ngrokUrl) {
    await updateServerWebhookUrl(ngrokUrl);
  }
}

main();
