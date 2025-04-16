# GitHub PR再レビュー改善提案追跡実装計画

## 実装の概要

前回のコードレビューで指摘した改善提案を追跡し、2回目以降のレビューでそれらが修正されたかを評価する機能を実装します。この実装は以下のアプローチに基づきます：

1. **埋め込みデータ方式**: GitHubコメントにHTMLコメントとして構造化データを埋め込む
2. **AIバックアップ抽出**: 埋め込みデータが取得できない場合のフォールバック
3. **AIプロンプト最適化**: 前回改善提案の評価に特化した処理

## 実装ステップ

### ステップ1: GitHubReviewFeedbackSenderService の拡張

`sendReviewFeedbackToPullRequest` メソッドを修正して、改善提案データをマークダウンコメントに埋め込みます。

```typescript
async sendReviewFeedbackToPullRequest(
  owner: string,
  repo: string,
  pullRequestId: number,
  reviewToken: string,
  feedbacks: Array<any>,
  reviewContext?: {
    isReReview?: boolean;
    sourceCommentId?: number;
    isDescriptionRequest?: boolean;
  }
): Promise<boolean> {
  // 既存のコード...
  
  // 改善提案のみを抽出
  const improvements = feedbacks.filter(f => f.feedback_type === "improvement").map(imp => ({
    category: imp.category,
    point: imp.point,
    suggestion: imp.suggestion,
    code_snippet: imp.code_snippet,
    reference_url: imp.reference_url
  }));
  
  // マークダウンフィードバックを生成
  const markdownFeedback = this.formatFeedbacksToMarkdown(
    feedbacks, 
    reviewContext?.isReReview || false,
    reviewToken
  );
  
  // 埋め込みデータを追加（GitHubのUIでは見えない）
  const embeddedData = {
    review_token: reviewToken,
    timestamp: Date.now(),
    improvements: improvements,
    is_re_review: reviewContext?.isReReview || false
  };
  
  const markdownWithEmbeddedData = markdownFeedback + `\n\n<!-- REVIEW_DATA
${JSON.stringify(embeddedData, null, 0)}
-->`;
  
  // GitHub PRにコメントを送信
  // ...残りの既存コード...
}
```

### ステップ2: GitHubPullRequestMonitoringService に前回改善提案取得機能を追加

前回レビューから改善提案を抽出する機能を追加します。

```typescript
async getPreviousImprovements(owner: string, repo: string, prNumber: number): Promise<any[]> {
  try {
    // トラッカーから前回のレビュー情報を取得
    const tracker = await this.trackerRepository.findOne({
      where: { owner, repo, pull_request_id: prNumber }
    });
    
    if (!tracker || !tracker.ai_review_comment_ids) {
      console.log(`PR #${prNumber} の前回レビュー情報が見つかりません`);
      return [];
    }
    
    // 前回のレビューコメントIDを取得
    let aiReviewCommentIds = [];
    try {
      aiReviewCommentIds = JSON.parse(tracker.ai_review_comment_ids);
    } catch (e) {
      console.error("AIレビューコメントIDのパース失敗:", e);
      return [];
    }
    
    if (aiReviewCommentIds.length === 0) {
      console.log(`PR #${prNumber} のレビューコメントIDが見つかりません`);
      return [];
    }
    
    // 最新のレビューコメントIDを使用
    const lastCommentId = aiReviewCommentIds[aiReviewCommentIds.length - 1];
    
    // GitHubコメントを取得
    const comment = await this.githubService.getPullRequestComment(owner, repo, lastCommentId);
    if (!comment || !comment.body) {
      console.log(`コメント #${lastCommentId} の内容が取得できません`);
      return [];
    }
    
    // 方法1: 埋め込みデータからの抽出を試みる
    const embeddedData = this.extractEmbeddedData(comment.body);
    if (embeddedData?.improvements?.length > 0) {
      console.log(`埋め込みデータから${embeddedData.improvements.length}件の改善提案を抽出しました`);
      return embeddedData.improvements;
    }
    
    // 方法2: AIによる抽出をバックアップとして使用
    console.log("埋め込みデータが見つからないか無効なため、AIで抽出します");
    return await this.extractImprovementsWithAI(comment.body);
    
  } catch (error) {
    console.error(`前回改善提案取得エラー (${owner}/${repo}#${prNumber}):`, error);
    return [];
  }
}

// 埋め込みデータの抽出
private extractEmbeddedData(commentBody: string): any {
  const match = commentBody.match(/<!-- REVIEW_DATA\n([\s\S]*?)\n-->/);
  if (!match || !match[1]) return null;
  
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.error("埋め込みデータ解析エラー:", error);
    return null;
  }
}

// AIによるフォールバック抽出
private async extractImprovementsWithAI(commentBody: string): Promise<any[]> {
  console.log("AIを使用して改善提案を抽出します");
  
  try {
    const messages = [
      {
        role: "system",
        content: "あなたはGitHubのPRレビューコメントから改善提案を抽出する専門家です。正確なJSON形式でデータを抽出してください。"
      },
      {
        role: "user",
        content: `
以下のPRレビューコメントから、改善提案の内容を抽出してください。
特に「🔧 改善提案」セクションの内容に注目してください。

${commentBody}

各改善提案を以下のJSON形式で抽出してください：
[
  {
    "category": "カテゴリ（code_quality, security, performanceなど）",
    "point": "指摘された問題点",
    "suggestion": "提案された改善策",
    "code_snippet": "問題のあるコード（あれば）"
  }
]

JSONのみを出力し、余分な説明は不要です。
`
      }
    ];
    
    // AIに抽出を依頼
    const response = await this.aiService.model.invoke(messages);
    
    // 応答からJSONデータを抽出
    const content = typeof response.content === "string" 
      ? response.content 
      : Array.isArray(response.content) 
        ? response.content.map(item => typeof item === "object" && "text" in item ? item.text : "").join("") 
        : "";
    
    // JSONを抽出する正規表現
    const jsonMatch = content.match(/\[\s*\{.*\}\s*\]/s);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`AIによる抽出: ${parsed.length}件の改善提案を抽出しました`);
      return parsed;
    }
    
    console.log("AIからの応答からJSONを抽出できませんでした");
    return [];
  } catch (error) {
    console.error("AI抽出エラー:", error);
    return [];
  }
}
```

### ステップ3: checkSinglePullRequest メソッドの強化

PR評価時に前回の改善提案を考慮するよう修正します。

```typescript
async checkSinglePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  commentId?: number
): Promise<boolean> {
  // 既存のコード...
  
  // 再レビューかどうかを判断
  const trackerRecord = await this.trackerRepository.findOne({
    where: { owner, repo, pull_request_id: prNumber }
  });
  
  const isReReview = trackerRecord !== null && trackerRecord.review_count > 0;
  let previousImprovements = [];
  
  // 再レビューの場合は前回の改善提案を取得
  if (isReReview) {
    console.log(`PR #${prNumber} は再レビューです（${trackerRecord.review_count}回目）`);
    previousImprovements = await this.getPreviousImprovements(owner, repo, prNumber);
    console.log(`前回のレビューから${previousImprovements.length}件の改善提案を抽出しました`);
  }
  
  // レビュートークンを生成
  const reviewToken = `github-review-${owner}-${repo}-${prNumber}-${Date.now()}`;
  
  // AIレビューを実行（前回改善提案を含める）
  const reviewResult = await this.aiService.reviewGitHubPullRequest(
    owner,
    repo,
    prNumber,
    {
      isReReview,
      reviewToken,
      sourceCommentId: commentId,
      isDescriptionRequest: commentId === undefined,
      previousImprovements,
      // 他のコンテキスト情報...
    }
  );
  
  // レビュー結果をGitHubに送信
  const sendResult = await this.feedbackSenderService.sendReviewFeedbackToPullRequest(
    owner,
    repo,
    prNumber,
    reviewToken,
    reviewResult,
    {
      isReReview,
      sourceCommentId: commentId,
      isDescriptionRequest: commentId === undefined
    }
  );
  
  // 残りの既存コード...
}
```

### ステップ4: AIService の拡張

AIサービスに、前回の改善提案を考慮したレビュープロンプトを追加します。

```typescript
async reviewGitHubPullRequest(
  owner: string,
  repo: string,
  pullRequestId: number,
  context?: GitHubPullRequestReviewContext
): Promise<Array<any>> {
  // 既存のコード...
  
  // 前回の改善提案に関するコンテキストを構築
  let previousImprovementsContext = "";
  
  if (context?.isReReview && context.previousImprovements && context.previousImprovements.length > 0) {
    console.log(`前回の改善提案情報: ${context.previousImprovements.length}件`);
    
    previousImprovementsContext = `## 前回のレビューで指摘された改善項目\n\n`;
    previousImprovementsContext += context.previousImprovements.map((imp, idx) => `
### 改善項目 ${idx + 1}: ${this.getCategoryDisplayName(imp.category as FeedbackCategory)}
- **問題点**: ${imp.point}
- **改善提案**: ${imp.suggestion || "具体的な提案なし"}
${imp.code_snippet ? `- **問題のあったコード**:\n\`\`\`\n${imp.code_snippet}\n\`\`\`` : ""}
`).join('\n');
    
    previousImprovementsContext += `\n\n上記の各改善項目について、現在のコードで解決されているか評価してください。改善されている場合は良い点として挙げ、まだ改善されていない場合は再度改善提案として挙げてください。\n\n`;
  }
  
  // プロンプトテンプレート
  const messages = [
    // システムメッセージ...
    {
      role: "user",
      content: `以下のGitHub Pull Requestをレビューし、新入社員の成長を促す前向きなフィードバックを生成してください。
    
# Pull Request情報
- PR番号: #${pullRequestId}
- リポジトリ: ${owner}/${repo}
- タイトル: ${prInfo.title}
...

${
  context?.isReReview
    ? `
# 再レビュー指示
このプルリクエストは以前にもレビューされています。以下の点を重視してください：
1. 前回のレビューからどのように改善されたかを確認し、成長を認めてください
2. 修正の試みがあれば、完璧でなくても前向きに評価してください
3. 改善された部分は具体的に褒めて、成長を強調してください
4. まだ改善の余地がある点は、次のステップとして何をすべきか提案してください

${previousImprovementsContext}
`
    : ""
}

...（残りの既存プロンプト）...`,
    },
  ];
  
  // 残りの既存コード...
}
```

### ステップ5: レビュー結果表示の改善

GitHubReviewFeedbackSenderService の formatFeedbacksToMarkdown メソッドを拡張して、前回提案に対する改善状況を視覚的に表示します。

```typescript
private formatFeedbacksToMarkdown(
  feedbacks: Array<any>,
  isReReview: boolean,
  reviewToken: string,
  previousImprovements?: any[] // 追加
): string {
  // 既存のコード...
  
  // 再レビューで前回改善提案がある場合、進捗セクションを追加
  if (isReReview && previousImprovements && previousImprovements.length > 0) {
    // 改善提案とフィードバックを照合して改善状況を評価
    const evaluatedImprovements = this.evaluateImprovementProgress(previousImprovements, feedbacks);
    
    const improvedCount = evaluatedImprovements.filter(imp => imp.status === 'improved').length;
    const pendingCount = evaluatedImprovements.filter(imp => imp.status === 'pending').length;
    const totalCount = evaluatedImprovements.length;
    
    // 進捗セクションの追加
    markdown += `\n## 🔄 前回の改善提案の進捗\n\n`;
    
    // 進捗率の計算
    const progressPercent = Math.round((improvedCount / totalCount) * 100);
    markdown += `前回指摘した${totalCount}件の改善提案のうち、**${improvedCount}件が改善**されました（${progressPercent}%）\n\n`;
    
    // 進捗バーの表示
    markdown += `${'🟩'.repeat(Math.floor(progressPercent/10))}${'⬜'.repeat(10-Math.floor(progressPercent/10))}\n\n`;
    
    // 改善された項目を表示
    if (improvedCount > 0) {
      markdown += `### ✅ 改善された項目\n\n`;
      evaluatedImprovements
        .filter(imp => imp.status === 'improved')
        .forEach((item, index) => {
          markdown += `${index + 1}. **${this.getCategoryDisplayName(item.category as FeedbackCategory)}**: ${item.point}\n`;
          markdown += `   👏 **改善されました！**\n\n`;
        });
    }
    
    // 未改善の項目
    if (pendingCount > 0) {
      markdown += `### 🔄 引き続き改善が必要な項目\n\n`;
      evaluatedImprovements
        .filter(imp => imp.status === 'pending')
        .forEach((item, index) => {
          markdown += `${index + 1}. **${this.getCategoryDisplayName(item.category as FeedbackCategory)}**: ${item.point}\n`;
          if (item.suggestion) {
            markdown += `   💡 **提案**: ${item.suggestion}\n\n`;
          }
        });
    }
  }
  
  // 残りの既存コード...
}

// 改善状況を評価するヘルパーメソッド
private evaluateImprovementProgress(previousImprovements: any[], currentFeedbacks: any[]): any[] {
  // 現在の改善提案と良い点からキーワードを抽出
  const currentIssues = currentFeedbacks
    .filter(f => f.feedback_type === 'improvement')
    .map(f => f.point.toLowerCase());
    
  const strengths = currentFeedbacks
    .filter(f => f.feedback_type === 'strength')
    .map(f => f.point.toLowerCase());

  // 各前回提案が改善されたかを評価
  return previousImprovements.map(imp => {
    const pointLower = imp.point.toLowerCase();
    
    // 判定ロジック:
    // 1. 同じ問題が現在の改善提案にないか
    // 2. 関連する言及が良い点にあるか
    
    const issueStillExists = currentIssues.some(issue => 
      this.textSimilarity(pointLower, issue) > 0.7
    );
    
    const improvedMentioned = strengths.some(strength => 
      (strength.includes('改善') || strength.includes('修正') || strength.includes('解決')) &&
      this.getRelatedKeywords(pointLower).some(keyword => 
        strength.includes(keyword)
      )
    );
    
    return {
      ...imp,
      status: (issueStillExists || (!improvedMentioned && !this.isSimpleIssue(imp)))
        ? 'pending'
        : 'improved'
    };
  });
}

// テキスト類似度の簡易計算（単語の重複率）
private textSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));
  
  // 重複ワード数 / 全ユニークワード数
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return union === 0 ? 0 : intersection / union;
}

// 問題文から関連キーワードを抽出
private getRelatedKeywords(text: string): string[] {
  // 単語の抽出（4文字以上で代表的な意味を持つもの）
  return text.split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['です', 'ます', 'した', 'など', 'あり'].includes(w));
}

// シンプルな問題かを判定
private isSimpleIssue(improvement: any): boolean {
  const simpleIssueKeywords = [
    '変数名', 'コメント', 'インデント', '空白', 'スペース',
    '命名', 'フォーマット', 'スタイル'
  ];
  
  return simpleIssueKeywords.some(keyword => 
    improvement.point.includes(keyword) || 
    (improvement.suggestion && improvement.suggestion.includes(keyword))
  );
}
```

## 実装順序

1. **GitHubReviewFeedbackSenderService**:
   - コメント送信時に埋め込みデータを追加
   - 必要な前提処理の確認

2. **GitHubPullRequestMonitoringService**:
   - 前回改善提案の抽出機能
   - 埋め込みデータ抽出と AI バックアップ機能

3. **AIService**:
   - 再レビュー時の専用プロンプト強化
   - 前回改善提案を考慮したレビュー生成

4. **レビュー表示の改善**:
   - 進捗表示機能
   - 改善状況の視覚化

5. **テストとデバッグ**:
   - 単体テスト
   - 統合テスト

## 段階的ロールアウト計画

1. **フェーズ1**: 埋め込みデータの追加実装
   - GitHubコメントに埋め込み
   - 抽出機能の検証

2. **フェーズ2**: AIバックアップ抽出の追加
   - フォールバックとして実装
   - 精度の検証と調整

3. **フェーズ3**: 前回提案評価の強化
   - AIプロンプト最適化
   - 評価ロジック調整

4. **フェーズ4**: UI/UX強化
   - 進捗表示の改善
   - フィードバック形式の最適化

## 評価指標

- **抽出成功率**: 埋め込みデータ方式での抽出成功率
- **AIバックアップ精度**: AIによる抽出の正確さ
- **評価精度**: 改善されたかどうかの評価の正確さ
- **ユーザー満足度**: 利用者からのフィードバック