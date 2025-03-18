#!/usr/bin/env node

/**
 * すべてのマイグレーションを元に戻すスクリプト
 *
 * 使い方:
 * npm run migration:revert-all
 */

const { execSync } = require("child_process");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(
  "\x1b[33m%s\x1b[0m",
  "警告: このスクリプトはすべてのマイグレーションを元に戻します。"
);
console.log(
  "\x1b[33m%s\x1b[0m",
  "データベース内のすべてのテーブルが削除され、データが失われます。"
);

rl.question("\x1b[31m本当に実行しますか？(yes/no): \x1b[0m", (answer) => {
  if (answer.toLowerCase() !== "yes") {
    console.log("操作を中止しました。");
    rl.close();
    return;
  }

  console.log("\x1b[36m%s\x1b[0m", "マイグレーションを元に戻しています...");

  try {
    // データベースの状況を確認
    const status = execSync(
      "npx typeorm-ts-node-commonjs migration:show -d src/data-source.ts"
    ).toString();
    console.log("現在のマイグレーション状況:");
    console.log(status);

    // 実行済みのマイグレーション数を確認 (Migration X has been executed の行数を数える)
    const executedMigrationCount = (
      status.match(/Migration.*has been executed/g) || []
    ).length;

    if (executedMigrationCount === 0) {
      console.log(
        "\x1b[32m%s\x1b[0m",
        "実行済みのマイグレーションはありません。"
      );
      rl.close();
      return;
    }

    console.log(
      `\x1b[36m${executedMigrationCount}個のマイグレーションが実行されています。\x1b[0m`
    );

    // 各マイグレーションを順番に元に戻す
    for (let i = 0; i < executedMigrationCount; i++) {
      console.log(
        `\x1b[36mマイグレーション #${
          i + 1
        }/${executedMigrationCount} を元に戻しています...\x1b[0m`
      );
      execSync(
        "npx typeorm-ts-node-commonjs migration:revert -d src/data-source.ts",
        { stdio: "inherit" }
      );
    }

    console.log(
      "\x1b[32m%s\x1b[0m",
      "すべてのマイグレーションが正常に元に戻されました。"
    );
  } catch (error) {
    console.error("\x1b[31mエラーが発生しました:\x1b[0m", error.message);
    console.log(
      "コマンド実行時のエラー詳細:",
      error.stdout?.toString() || error.stderr?.toString() || "エラー詳細なし"
    );
    process.exit(1);
  } finally {
    rl.close();
  }
});
