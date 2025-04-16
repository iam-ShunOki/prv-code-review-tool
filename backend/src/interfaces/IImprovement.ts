/**
 * 改善提案のインターフェース
 */
export interface IImprovement {
  /** カテゴリ */
  category: string;

  /** 問題点 */
  point: string;

  /** 改善案 */
  suggestion: string;

  /** コードスニペット（オプション） */
  code_snippet?: string;

  /** 参照URL（オプション） */
  reference_url?: string;
}
