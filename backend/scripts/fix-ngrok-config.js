#!/usr/bin/env node

/**
 * ngrok設定ファイルを修正するスクリプト
 * - 古い設定ファイル形式から新しい形式に更新
 * - version: 2 プロパティを追加
 *
 * 使用方法:
 * node scripts/fix-ngrok-config.js
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// 設定ファイルのパス
const oldConfigPath = path.join(os.homedir(), ".ngrok2", "ngrok.yml");
const newConfigDir = path.join(os.homedir(), ".config", "ngrok");
const newConfigPath = path.join(newConfigDir, "ngrok.yml");

/**
 * 設定ファイルを修正
 */
function fixConfigFile() {
  console.log("🔍 ngrok設定ファイルを確認中...");

  // 新しいディレクトリが存在するか確認
  let hasNewConfig = false;
  try {
    if (fs.existsSync(newConfigDir) && fs.existsSync(newConfigPath)) {
      hasNewConfig = true;
      console.log(`✅ 新しい設定ファイルが見つかりました: ${newConfigPath}`);
    }
  } catch (error) {
    console.log(
      `❌ 新しい設定ファイルの確認中にエラーが発生しました: ${error.message}`
    );
  }

  // 古い設定ファイルが存在するか確認
  let hasOldConfig = false;
  let oldConfig = "";
  try {
    if (fs.existsSync(oldConfigPath)) {
      hasOldConfig = true;
      oldConfig = fs.readFileSync(oldConfigPath, "utf8");
      console.log(`🔍 古い設定ファイルが見つかりました: ${oldConfigPath}`);
    }
  } catch (error) {
    console.log(
      `❌ 古い設定ファイルの確認中にエラーが発生しました: ${error.message}`
    );
  }

  // 新しい設定ファイルが存在しないが古い設定がある場合
  if (!hasNewConfig && hasOldConfig) {
    try {
      console.log("🔄 古い設定を新しい形式に変換しています...");

      // versionプロパティを追加
      let newConfig = "version: 2\n";

      // 古い設定を追加
      if (oldConfig) {
        newConfig += oldConfig;
      }

      // authtoken行がない場合は警告
      if (!newConfig.includes("authtoken:")) {
        console.log(
          "⚠️ authtokenが見つかりません。ngrokアカウントで認証する必要があります。"
        );
      }

      // 新しいディレクトリを作成
      if (!fs.existsSync(newConfigDir)) {
        fs.mkdirSync(newConfigDir, { recursive: true });
        console.log(`✅ ディレクトリを作成しました: ${newConfigDir}`);
      }

      // 新しい設定ファイルを書き込み
      fs.writeFileSync(newConfigPath, newConfig);
      console.log(`✅ 新しい設定ファイルを作成しました: ${newConfigPath}`);

      return true;
    } catch (error) {
      console.error(
        `❌ 設定ファイルの変換中にエラーが発生しました: ${error.message}`
      );
      return false;
    }
  }
  // 両方の設定ファイルが存在しない場合
  else if (!hasNewConfig && !hasOldConfig) {
    console.log(
      "⚠️ 設定ファイルが見つかりません。ngrok authtokenコマンドを実行して新規作成してください。"
    );
    return false;
  }
  // 新しい設定ファイルがすでに存在する場合
  else if (hasNewConfig) {
    // バージョンプロパティがあるか確認
    try {
      const newConfig = fs.readFileSync(newConfigPath, "utf8");
      if (!newConfig.includes("version:")) {
        console.log("🔄 version プロパティを追加します...");
        const updatedConfig = "version: 2\n" + newConfig;
        fs.writeFileSync(newConfigPath, updatedConfig);
        console.log("✅ 設定ファイルを更新しました。");
      } else {
        console.log("✅ 設定ファイルは既に適切な形式です。");
      }
      return true;
    } catch (error) {
      console.error(
        `❌ 設定ファイルの更新中にエラーが発生しました: ${error.message}`
      );
      return false;
    }
  }

  return false;
}

/**
 * ngrokバージョンを表示
 */
function showNgrokVersion() {
  try {
    const output = execSync("npx ngrok --version").toString();
    console.log(`🔍 ngrokバージョン: ${output.trim()}`);
  } catch (error) {
    console.log("❌ ngrokバージョンの取得に失敗しました。");
  }
}

// メイン処理を実行
console.log("🚀 ngrok設定ファイル修正ツールを開始します...");
showNgrokVersion();
const result = fixConfigFile();

if (result) {
  console.log("\n✅ 設定ファイルが正常に更新されました。");
  console.log("ngrokを再起動して、変更を適用してください。");
} else {
  console.log("\n⚠️ 設定ファイルの更新が完了しませんでした。");
  console.log("手動で以下のコマンドを実行してngrokを再設定してください：");
  console.log("  npx ngrok authtoken YOUR_AUTH_TOKEN");
}
