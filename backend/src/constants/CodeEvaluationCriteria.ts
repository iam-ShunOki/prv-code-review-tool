// backend/src/constants/CodeEvaluationCriteria.ts
import { FeedbackCategory, FeedbackPriority } from "../models/Feedback";

/**
 * コード評価基準
 * AI がコードレビューを行う際の固定された観点のリスト
 */
export const CodeEvaluationCriteria: Record<FeedbackCategory, string[]> = {
  // コード品質に関する評価基準
  [FeedbackCategory.CODE_QUALITY]: [
    "命名規則が適切で意味のある変数名、関数名、クラス名が使用されているか",
    "コードが適切に構造化され、責任が明確に分離されているか",
    "エラーハンドリングが適切に実装されているか（try-catchなど）",
    "不要なコメントやデバッグコードが残っていないか",
    "ハードコードされた値が適切に定数として定義されているか",
    "不要な重複コードがないか（DRY原則）",
    "適切な型や型アノテーションが使用されているか",
  ],

  // セキュリティに関する評価基準
  [FeedbackCategory.SECURITY]: [
    "SQLインジェクションの脆弱性がないか（パラメータ化クエリの使用）",
    "クロスサイトスクリプティング（XSS）対策が行われているか",
    "機密情報（APIキー、パスワードなど）が直接コードに記述されていないか",
    "入力値の検証と無害化が適切に行われているか",
    "認証と認可が適切に実装されているか",
  ],

  // パフォーマンスに関する評価基準
  [FeedbackCategory.PERFORMANCE]: [
    "不要なループや非効率なアルゴリズムがないか",
    "リソース（メモリ、CPU、ネットワーク）の使用が最適化されているか",
    "データベースクエリが最適化されているか",
    "キャッシュが適切に使用されているか",
    "非同期処理が効率的に実装されているか",
  ],

  // ベストプラクティスに関する評価基準
  [FeedbackCategory.BEST_PRACTICE]: [
    "言語やフレームワークの推奨されるパターンに従っているか",
    "コードの一貫性があるか（スタイル、パターン、アプローチ）",
    "テストが書かれているか、またはテスト可能な設計になっているか",
    "設定と環境依存の処理が適切に分離されているか",
    "イミュータビリティ（不変性）が適切に使用されているか",
  ],

  // 可読性に関する評価基準
  [FeedbackCategory.READABILITY]: [
    "コードの構造が明確で理解しやすいか",
    "関数やメソッドが単一責任を持ち、適切なサイズか",
    "コメントが必要な箇所に適切に記述されているか",
    "インデントやスペーシングが一貫しているか",
    "複雑な条件や式が適切に分解されているか",
  ],

  // 機能性に関する評価基準
  [FeedbackCategory.FUNCTIONALITY]: [
    "コードが仕様通りに動作するか",
    "エッジケースが適切に処理されているか",
    "境界値が考慮されているか",
    "ユーザー入力の検証が適切に行われているか",
    "必要なすべての機能が実装されているか",
  ],

  // 保守性に関する評価基準
  [FeedbackCategory.MAINTAINABILITY]: [
    "コードがモジュール化されており、再利用可能か",
    "依存関係が明確に管理されているか",
    "将来の変更や拡張が容易か",
    "技術的負債が最小限に抑えられているか",
    "ログ記録が適切に実装されているか",
  ],

  // アーキテクチャに関する評価基準
  [FeedbackCategory.ARCHITECTURE]: [
    "適切なデザインパターンが使用されているか",
    "レイヤー間の依存関係が適切に管理されているか",
    "インターフェースと実装が適切に分離されているか",
    "システムの拡張性が考慮されているか",
    "コンポーネント間の結合度が低く、凝集度が高いか",
  ],

  // その他の基準
  [FeedbackCategory.OTHER]: [
    "ドキュメントが適切に記述されているか",
    "ライセンスの適切な表記があるか",
    "国際化（i18n）やローカライゼーション（l10n）が考慮されているか",
    "アクセシビリティが考慮されているか",
    "コード規約に準拠しているか",
  ],
};

// カテゴリごとの優先度定義（カテゴリによって付与するデフォルト優先度が異なる場合に使用）
export const CategoryPriorityMap: Record<FeedbackCategory, FeedbackPriority> = {
  [FeedbackCategory.SECURITY]: FeedbackPriority.HIGH, // セキュリティ問題は常に高優先度
  [FeedbackCategory.FUNCTIONALITY]: FeedbackPriority.HIGH, // 機能性の問題も高優先度
  [FeedbackCategory.CODE_QUALITY]: FeedbackPriority.MEDIUM,
  [FeedbackCategory.PERFORMANCE]: FeedbackPriority.MEDIUM,
  [FeedbackCategory.BEST_PRACTICE]: FeedbackPriority.MEDIUM,
  [FeedbackCategory.MAINTAINABILITY]: FeedbackPriority.MEDIUM,
  [FeedbackCategory.ARCHITECTURE]: FeedbackPriority.MEDIUM,
  [FeedbackCategory.READABILITY]: FeedbackPriority.LOW,
  [FeedbackCategory.OTHER]: FeedbackPriority.LOW,
};
