import { IImprovement } from "../interfaces/IImprovement";

export class ImprovementEvaluationService {
  /**
   * 改善提案を評価
   */
  evaluateImprovements(
    previousImprovements: IImprovement[],
    currentStrengths: string[],
    currentIssues: string[]
  ): Array<{
    improvement: IImprovement;
    status: "improved" | "partially_improved" | "not_improved";
    evidence?: string;
  }> {
    return previousImprovements.map((improvement) => {
      const evaluation = this.evaluateSingleImprovement(
        improvement,
        currentStrengths,
        currentIssues
      );
      return {
        improvement,
        ...evaluation,
      };
    });
  }

  /**
   * 単一の改善提案を評価
   */
  private evaluateSingleImprovement(
    improvement: IImprovement,
    currentStrengths: string[],
    currentIssues: string[]
  ): {
    status: "improved" | "partially_improved" | "not_improved";
    evidence?: string;
  } {
    // 改善の証拠を探す
    const positiveEvidence = this.findPositiveEvidence(
      improvement,
      currentStrengths
    );
    if (positiveEvidence) {
      return {
        status: "improved",
        evidence: positiveEvidence,
      };
    }

    // 同じ問題が残っているか確認
    const remainingIssue = this.findRemainingIssue(improvement, currentIssues);
    if (remainingIssue) {
      return {
        status: "not_improved",
        evidence: `同様の問題が依然として存在: ${remainingIssue}`,
      };
    }

    // 部分的な改善の証拠を探す
    const partialEvidence = this.findPartialImprovement(
      improvement,
      currentStrengths
    );
    if (partialEvidence) {
      return {
        status: "partially_improved",
        evidence: partialEvidence,
      };
    }

    // 証拠が不明確な場合
    return {
      status: "not_improved",
      evidence: "改善の証拠が見つかりません",
    };
  }

  /**
   * 改善の肯定的な証拠を探す
   */
  private findPositiveEvidence(
    improvement: IImprovement,
    strengths: string[]
  ): string | null {
    const keywords = this.extractKeywords(improvement);
    const positivePatterns = [
      "改善されました",
      "修正されました",
      "解決されました",
      "対応済み",
      "実装されました",
      "向上しています",
      "改善されています",
    ];

    for (const strength of strengths) {
      // キーワードと肯定的なパターンの両方を含む、または
      // キーワードを含み、かつ明確な改善を示す表現がある
      if (
        keywords.some((keyword) =>
          strength.toLowerCase().includes(keyword.toLowerCase())
        ) &&
        (positivePatterns.some((pattern) => strength.includes(pattern)) ||
          (strength.includes("改善") && !strength.includes("必要")) ||
          (strength.includes("向上") && !strength.includes("必要")))
      ) {
        return strength;
      }
    }

    return null;
  }

  /**
   * 同じ問題が残っているか確認
   */
  private findRemainingIssue(
    improvement: IImprovement,
    currentIssues: string[]
  ): string | null {
    const keywords = this.extractKeywords(improvement);

    for (const issue of currentIssues) {
      // 重要なキーワードが一致する場合、同じ問題と判断
      if (keywords.some((keyword) => issue.includes(keyword))) {
        return issue;
      }
    }

    return null;
  }

  /**
   * 部分的な改善の証拠を探す
   */
  private findPartialImprovement(
    improvement: IImprovement,
    strengths: string[]
  ): string | null {
    const keywords = this.extractKeywords(improvement);
    const partialPatterns = [
      "改善が見られます",
      "進展が見られます",
      "取り組みが見られます",
      "一部改善されています",
      "改善が進んでいます",
      "対策が進んでいます",
    ];

    for (const strength of strengths) {
      // キーワードと部分的改善のパターンの両方を含む、または
      // キーワードを含み、かつ進行中の改善を示す表現がある
      if (
        keywords.some((keyword) =>
          strength.toLowerCase().includes(keyword.toLowerCase())
        ) &&
        (partialPatterns.some((pattern) => strength.includes(pattern)) ||
          (strength.includes("進んで") && !strength.includes("必要")) ||
          (strength.includes("見られ") && !strength.includes("必要")))
      ) {
        return strength;
      }
    }

    return null;
  }

  /**
   * 改善提案から重要なキーワードを抽出
   */
  private extractKeywords(improvement: IImprovement): string[] {
    const combinedText = `${improvement.point} ${improvement.suggestion}`;

    // 特定のキーワードを除外
    const excludeWords = [
      "です",
      "ます",
      "した",
      "など",
      "あり",
      "する",
      "れる",
      "いる",
      "必要",
      "場合",
      "ため",
    ];

    // キーワードを抽出（名詞や技術用語を優先）
    const words = combinedText
      .split(/[\s,、。．　]+/)
      .map((word) => word.toLowerCase())
      .filter(
        (word) =>
          word.length >= 3 &&
          !excludeWords.some((exclude) => word.includes(exclude))
      );

    // 重複を除去
    return Array.from(new Set(words));
  }
}
