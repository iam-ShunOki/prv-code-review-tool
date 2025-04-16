import { ImprovementEvaluationService } from "../services/ImprovementEvaluationService";

async function runEvaluationTests() {
  console.log("改善提案の評価テストを開始します...\n");

  const service = new ImprovementEvaluationService();

  // テストケース1: 完全に改善された場合
  const test1 = {
    previousImprovement: {
      category: "code_quality",
      point: "変数名が意味を表していない",
      suggestion: "変数名を具体的な意味を持つ名前に変更",
    },
    currentStrengths: [
      "変数名が適切に改善されました。命名規則に従った明確な名前になっています。",
    ],
    currentIssues: [],
    expected: "improved",
  };

  // テストケース2: 部分的に改善された場合
  const test2 = {
    previousImprovement: {
      category: "security",
      point: "パスワードが平文で保存されている",
      suggestion: "bcryptを使用してパスワードをハッシュ化",
    },
    currentStrengths: [
      "パスワードのセキュリティ対策が進んでいます。ハッシュ化の実装が見られます。",
    ],
    currentIssues: ["パスワードのソルト生成方法を改善する必要があります。"],
    expected: "partially_improved",
  };

  // テストケース3: まだ改善されていない場合
  const test3 = {
    previousImprovement: {
      category: "performance",
      point: "N+1問題が発生している",
      suggestion: "クエリをJOINを使用して最適化",
    },
    currentStrengths: ["コードのフォーマットが改善されています。"],
    currentIssues: [
      "N+1問題が依然として発生しています。クエリの最適化が必要です。",
    ],
    expected: "not_improved",
  };

  // テストケース4: 明確な改善の証拠がある場合
  const test4 = {
    previousImprovement: {
      category: "readability",
      point: "コメントが不足している",
      suggestion: "主要な処理にコメントを追加",
    },
    currentStrengths: [
      "コードの可読性が向上しています。適切なコメントが追加され、処理の意図が明確になりました。",
    ],
    currentIssues: [],
    expected: "improved",
  };

  // テストケース5: 部分的な進展がある場合
  const test5 = {
    previousImprovement: {
      category: "maintainability",
      point: "重複コードが多い",
      suggestion: "共通処理を関数として抽出",
    },
    currentStrengths: [
      "コードの重複削減が進んでいます。一部の処理が関数として抽出されています。",
    ],
    currentIssues: ["まだいくつかの重複コードが残っています。"],
    expected: "partially_improved",
  };

  const testCases = [test1, test2, test3, test4, test5];
  const results = [];

  console.log("テストケースの実行:");
  for (const [index, test] of testCases.entries()) {
    console.log(`\nテストケース ${index + 1}:`);
    console.log(`前回の改善提案: ${test.previousImprovement.point}`);

    const evaluation = service.evaluateImprovements(
      [test.previousImprovement],
      test.currentStrengths,
      test.currentIssues
    );

    const result = {
      case: `ケース${index + 1}`,
      expected: test.expected,
      actual: evaluation[0].status,
      passed: evaluation[0].status === test.expected,
      evidence: evaluation[0].evidence,
    };

    results.push(result);

    console.log(`期待される結果: ${test.expected}`);
    console.log(`実際の結果: ${evaluation[0].status}`);
    console.log(`判断の根拠: ${evaluation[0].evidence}`);
    console.log(`テスト結果: ${result.passed ? "✅ 成功" : "❌ 失敗"}`);
  }

  // 結果のサマリーを表示
  console.log("\n=== テスト結果サマリー ===");
  console.log(`総テスト数: ${results.length}`);
  console.log(`成功: ${results.filter((r) => r.passed).length}`);
  console.log(`失敗: ${results.filter((r) => !r.passed).length}`);

  // 詳細な結果を表示
  console.log("\n=== 詳細結果 ===");
  results.forEach((result) => {
    console.log(`\n${result.case}:`);
    console.log(`期待値: ${result.expected}`);
    console.log(`実際値: ${result.actual}`);
    console.log(`根拠: ${result.evidence}`);
    console.log(`結果: ${result.passed ? "成功" : "失敗"}`);
  });
}

runEvaluationTests().catch((error) => {
  console.error("テスト実行中にエラーが発生しました:", error);
  process.exit(1);
});
