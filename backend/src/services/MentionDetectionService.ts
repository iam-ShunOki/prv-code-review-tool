// backend/src/services/MentionDetectionService.ts
export class MentionDetectionService {
  /**
   * @codereviewメンションをテキスト内で検出
   */
  /**
   * 既存のdetectCodeReviewMentionメソッドを拡張して、
   * GitHubとBacklog両方に対応
   */
  detectCodeReviewMention(content: string): boolean {
    if (!content) {
      return false;
    }

    // 文字列内に「@codereview」があるかの基本チェック
    const basicCheck = /@codereview\b/i.test(content);

    // より柔軟なパターンも含めたチェック
    if (!basicCheck) {
      return this.detectGitHubCodeReviewMention(content);
    }

    return true;
  }

  /**
   * テキストからメール形式のユーザー情報を抽出
   */
  extractUserEmail(text: string): string | null {
    if (!text) return null;

    // テキスト内でメールパターンを探す
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const match = text.match(emailRegex);

    return match ? match[0] : null;
  }

  /**
   * GitHub特有のマークダウン形式を考慮したコードレビューメンション検出
   *
   * このメソッドはGitHubのマークダウン形式に対応し、
   * コードブロック内のメンションは無視し、
   * 引用やリスト内のメンションも検出します。
   */
  detectGitHubCodeReviewMention(content: string): boolean {
    if (!content) {
      return false;
    }

    // コードブロック内のテキストを一時的に除外
    const contentWithoutCodeBlocks = this.removeCodeBlocks(content);

    // GitHub特有のメンションパターン
    const mentionPatterns = [
      /@codereview\b/i, // 標準形式
      /@code-?review\b/i, // ハイフン付き形式
      /@code[_\s]review\b/i, // アンダースコアまたはスペース
      /\bcode\s?review\s(please|plz)\b/i, // 丁寧な依頼形式
      /\breview\smy\scode\b/i, // 「review my code」形式
      /\bai\s?review\b/i, // AIレビュー
    ];

    // いずれかのパターンにマッチすればtrue
    return mentionPatterns.some((pattern) =>
      pattern.test(contentWithoutCodeBlocks)
    );
  }

  /**
   * マークダウンのコードブロックを削除
   */
  private removeCodeBlocks(content: string): string {
    // バッククォート3つで囲まれたコードブロックを削除（GitHub Markdown対応）
    const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, "");

    // インラインコードも削除（シングルバッククォートで囲まれたもの）
    return withoutCodeBlocks.replace(/`[^`]*`/g, "");
  }

  /**
   * GitHubのマークダウン形式で書かれたチェックボックスの状態を検出
   */
  detectCheckboxStatus(content: string): { total: number; checked: number } {
    if (!content) {
      return { total: 0, checked: 0 };
    }

    // GitHub形式のチェックボックス（- [ ] と - [x] のパターン）
    const checkboxPattern = /- \[([ x])\]/g;
    const matches = content.match(checkboxPattern) || [];

    let total = matches.length;
    let checked = matches.filter((match) => match.includes("[x]")).length;

    return { total, checked };
  }
}
