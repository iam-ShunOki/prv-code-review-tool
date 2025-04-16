import { GitHubPullRequestMonitoringService } from "../services/GitHubPullRequestMonitoringService";

async function runAITests() {
  console.log("AI抽出のテストを開始します...\n");

  const service = new GitHubPullRequestMonitoringService();
  const results = await service.validateAIExtraction();

  console.log("\nテスト結果:");
  console.log(`総テストケース数: ${results.totalCases}`);
  console.log(`成功ケース数: ${results.successCases}`);
  console.log(`平均処理時間: ${results.averageTime}ms`);

  console.log("\nカテゴリ分布:");
  Object.entries(results.categoryDistribution).forEach(([category, count]) => {
    console.log(`- ${category}: ${count}件`);
  });

  console.log("\n詳細結果:");
  results.details.forEach((detail) => {
    console.log(`\nケース: ${detail.case}`);
    console.log(`- 成功: ${detail.success}`);
    console.log(`- 抽出数: ${detail.extractedCount}`);
    console.log(`- 処理時間: ${detail.extractionTime}ms`);
    if (detail.error) {
      console.log(`- エラー: ${detail.error}`);
    }
  });
}

runAITests().catch((error) => {
  console.error("テスト実行中にエラーが発生しました:", error);
  process.exit(1);
});
