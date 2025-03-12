#!/usr/bin/env node

/**
 * ngrokのバージョンを自動検出し、適切な方法でauthトークンを設定するスクリプト
 *
 * 使用方法:
 * node scripts/setup-ngrok.js <あなたのAuthトークン>
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// コマンドライン引数からAuthトークンを取得
const authToken = process.argv[2];

if (!authToken) {
  console.error("❌ エラー: Authトークンが指定されていません");
  console.log("使用方法: node scripts/setup-ngrok.js <あなたのAuthトークン>");
  process.exit(1);
}

/**
 * ngrokのバージョンを取得
 */
function getNgrokVersion() {
  try {
    // versionコマンドを実行
    const output = execSync("ngrok version").toString();

    // バージョン番号を抽出
    const versionMatch = output.match(
      /ngrok version (\d+\.\d+\.\d+)|version: (\d+\.\d+\.\d+)/i
    );

    if (versionMatch) {
      // 最初のキャプチャグループまたは2番目のキャプチャグループからバージョンを取得
      const version = versionMatch[1] || versionMatch[2];
      const majorVersion = parseInt(version.split(".")[0]);
      return { version, majorVersion };
    }

    // 正規表現でマッチしない場合はコマンド出力全体から判断
    if (output.includes("2.")) {
      return { version: "v2.x.x", majorVersion: 2 };
    } else if (output.includes("3.")) {
      return { version: "v3.x.x", majorVersion: 3 };
    }

    // バージョンが判別できない場合
    return { version: "unknown", majorVersion: 0 };
  } catch (error) {
    console.error(
      "❌ ngrokのバージョン取得中にエラーが発生しました:",
      error.message
    );
    return { version: "unknown", majorVersion: 0 };
  }
}

/**
 * ngrokのauthトークンを設定
 */
function setupNgrokAuth(token, majorVersion) {
  try {
    let command;

    if (majorVersion >= 3) {
      // v3以上の場合
      console.log(
        "🔍 ngrok v3を検出しました - config add-authtokenコマンドを使用します"
      );
      command = `ngrok config add-authtoken ${token}`;
    } else {
      // v2の場合
      console.log("🔍 ngrok v2を検出しました - authtokenコマンドを使用します");
      command = `ngrok authtoken ${token}`;
    }

    // コマンドを実行
    execSync(command, { stdio: "inherit" });
    console.log("✅ ngrokのAuthトークンを正常に設定しました");
    return true;
  } catch (error) {
    console.error(
      "❌ ngrokのAuthトークン設定中にエラーが発生しました:",
      error.message
    );
    return false;
  }
}

// メイン処理
function main() {
  console.log("🚀 ngrokセットアップスクリプトを開始します...");

  // ngrokのバージョンを取得
  const { version, majorVersion } = getNgrokVersion();
  console.log(
    `📋 検出されたngrokのバージョン: ${version} (メジャーバージョン: ${majorVersion})`
  );

  // バージョンに応じてauthトークンを設定
  if (majorVersion > 0) {
    setupNgrokAuth(authToken, majorVersion);
  } else {
    console.log(
      "⚠️ ngrokのバージョンを判別できませんでした。両方の方法を試します..."
    );

    // v3のコマンドを試す
    console.log("🔄 v3コマンドを試行中...");
    let success = false;
    try {
      execSync(`ngrok config add-authtoken ${authToken}`, { stdio: "pipe" });
      console.log("✅ v3コマンドが成功しました");
      success = true;
    } catch (error) {
      console.log("❌ v3コマンドが失敗しました");
    }

    // v3が失敗したらv2のコマンドを試す
    if (!success) {
      console.log("🔄 v2コマンドを試行中...");
      try {
        execSync(`ngrok authtoken ${authToken}`, { stdio: "pipe" });
        console.log("✅ v2コマンドが成功しました");
        success = true;
      } catch (error) {
        console.log("❌ v2コマンドも失敗しました");
      }
    }

    if (!success) {
      console.error(
        "❌ ngrokのAuthトークン設定に失敗しました。手動で設定してください。"
      );
    }
  }

  console.log("\n📝 使用方法:");
  console.log("- npm run ngrok          # ngrokを起動");
  console.log("- npm run dev:with-ngrok # 開発サーバーとngrokを同時起動");
  console.log("- npm run detect-ngrok   # ngrok URLを検出してシステムに設定");
}

main();
