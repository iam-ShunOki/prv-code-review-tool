// backend/src/services/MentionDetectionService.ts
export class MentionDetectionService {
  /**
   * @codereviewメンションをテキスト内で検出
   */
  detectCodeReviewMention(text: string): boolean {
    if (!text) return false;

    // @codereviewメンションをチェック
    return text.toLowerCase().includes("@codereview");
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
}
