#!/usr/bin/env node

/**
 * マイグレーションをすべて元に戻してから再適用するスクリプト
 *
 * 使い方:
 * npm run migration:reset
 */

const { execSync } = require("child_process");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// カラー出力用のヘルパー関数
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[36m${text}\x1b[0m`,
};

// マイグレーションの実行状態を取得する関数
function getExecutedMigrations() {
  try {
    const status = execSync(
      "npx typeorm-ts-node-commonjs migration:show -d src/data-source.ts"
    ).toString();
    console.log("現在のマイグレーション状況:");
    console.log(status);

    // 実行済みマイグレーションをカウント
    let executedCount = 0;
    const migrationLines = status
      .split("\n")
      .filter((line) => line.trim() !== "");

    for (const line of migrationLines) {
      // 様々な形式のTypeORM出力に対応
      if (
        (/has been executed/i.test(line) &&
          !/has not been executed/i.test(line)) ||
        /\[X\]/.test(line) ||
        (/EXECUTED/i.test(line) && !/NOT EXECUTED/i.test(line))
      ) {
        executedCount++;
      }
    }

    return executedCount;
  } catch (error) {
    console.error("マイグレーション状態の取得に失敗しました:", error.message);
    return 0;
  }
}

console.log(
  colors.yellow(
    "警告: このスクリプトはすべてのマイグレーションをリセットします。"
  )
);
console.log(
  colors.yellow(
    "データベース内のすべてのテーブルが削除され、データが失われます。"
  )
);
console.log(
  colors.yellow("その後、すべてのマイグレーションが再適用されます。")
);

rl.question(colors.red("本当に実行しますか？(yes/no): "), (answer) => {
  if (answer.toLowerCase() !== "yes") {
    console.log("操作を中止しました。");
    rl.close();
    return;
  }

  try {
    // 実行済みマイグレーションの数を確認
    const executedMigrationCount = getExecutedMigrations();
    console.log(
      colors.blue(
        `検出された実行済みマイグレーション数: ${executedMigrationCount}`
      )
    );

    // マイグレーションをロールバック
    if (executedMigrationCount > 0) {
      console.log(
        colors.blue(
          `${executedMigrationCount}個のマイグレーションをロールバックします...`
        )
      );

      for (let i = 0; i < executedMigrationCount; i++) {
        console.log(
          colors.blue(
            `マイグレーション #${
              i + 1
            }/${executedMigrationCount} を元に戻しています...`
          )
        );
        execSync(
          "npx typeorm-ts-node-commonjs migration:revert -d src/data-source.ts",
          { stdio: "inherit" }
        );
      }

      console.log(
        colors.green("すべてのマイグレーションが正常に元に戻されました。")
      );
    } else {
      console.log(colors.green("実行済みのマイグレーションはありません。"));
    }

    // マイグレーションを再適用
    console.log(colors.blue("マイグレーションを再適用しています..."));
    execSync(
      "npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts",
      { stdio: "inherit" }
    );

    console.log(
      colors.green("マイグレーションのリセットと再適用が完了しました！")
    );

    // 最終的なマイグレーション状態を表示
    console.log(colors.blue("最終的なマイグレーション状態:"));
    execSync(
      "npx typeorm-ts-node-commonjs migration:show -d src/data-source.ts",
      { stdio: "inherit" }
    );
  } catch (error) {
    console.error(colors.red("エラーが発生しました:"), error.message);
    if (error.stdout) console.log("標準出力:", error.stdout.toString());
    if (error.stderr) console.log("標準エラー:", error.stderr.toString());
    process.exit(1);
  } finally {
    rl.close();
  }
});
