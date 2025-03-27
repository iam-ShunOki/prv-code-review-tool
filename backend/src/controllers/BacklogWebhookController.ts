// backend/src/controllers/BacklogWebhookController.ts
import { Request, Response } from "express";
import { PullRequestMonitoringService } from "../services/PullRequestMonitoringService";
import { WebhookUrlService } from "../services/WebhookUrlService";
import { BacklogService } from "../services/BacklogService";
export class BacklogWebhookController {
  private pullRequestMonitoringService: PullRequestMonitoringService;
  private webhookUrlService: WebhookUrlService;
  private backlogService: BacklogService;
  constructor() {
    this.pullRequestMonitoringService = new PullRequestMonitoringService();
    this.webhookUrlService = WebhookUrlService.getInstance();
    this.backlogService = new BacklogService();
  }

  /**
   * Backlogからのwebhookイベントを処理
   */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("Backlogからのwebhookを受信しました:", req.body.type);
      const event = req.body;

      // プルリクエストコメントイベントかチェック
      if (event.type === "pull_request_comment") {
        const content = event.content;
        const projectKey = content.project.projectKey;
        const repoName = content.repository.name;
        const pullRequestId = content.number;
        const commentId = content.comment?.id; // コメントIDを取得

        if (!commentId) {
          console.log("コメントIDがありません。スキップします");
          res.status(200).json({ success: true });
          return;
        }

        console.log(
          `PR #${pullRequestId} へのコメント(ID: ${commentId})を受信しました。@codereviewをチェックします`
        );

        // コメント内容にメンションがあるかチェック
        if (content.comment && content.comment.content) {
          const mentionDetectionService =
            this.pullRequestMonitoringService["mentionDetectionService"];
          const hasMention = mentionDetectionService.detectCodeReviewMention(
            content.comment.content
          );

          if (hasMention) {
            console.log(
              `PR #${pullRequestId} のコメントに @codereview メンションがありました。レビューを実行します`
            );

            // プルリクエストのチェックを実行（コメントIDも渡す）
            await this.pullRequestMonitoringService.checkSinglePullRequest(
              projectKey,
              repoName,
              pullRequestId,
              commentId
            );
          } else {
            console.log(
              `PR #${pullRequestId} のコメントに @codereview メンションがありません。スキップします`
            );
          }
        }
      } else if (event.type.startsWith("pull_request")) {
        // その他のプルリクエスト関連イベント処理（既存コード）
        // ...
      }

      res.status(200).json({
        success: true,
        message: "Webhookを受信して処理しました",
      });
    } catch (error) {
      console.error("Webhook処理エラー:", error);
      res.status(500).json({
        success: false,
        message: "Webhook処理中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * 既存のプルリクエストをチェック（手動または起動時）
   */
  checkExistingPullRequests = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await this.pullRequestMonitoringService.checkExistingPullRequests();

      res.status(200).json({
        success: true,
        message: "既存のプルリクエストをチェックしました",
        data: result,
        webhook_url: this.webhookUrlService.getWebhookUrl(
          "/api/backlog/webhook"
        ), // URLも返す
      });
    } catch (error) {
      console.error("プルリクエストチェックエラー:", error);
      res.status(500).json({
        success: false,
        message: "既存のプルリクエストのチェック中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };

  /**
   * Webhook設定情報を取得
   */
  getWebhookInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const webhookUrl = this.webhookUrlService.getWebhookUrl(
        "/api/backlog/webhook"
      );

      res.status(200).json({
        success: true,
        data: {
          webhook_url: webhookUrl,
          setup_instructions:
            "Backlogのプロジェクト設定 > Webhooks で上記URLを登録してください。",
          triggers: [
            "プルリクエスト作成",
            "プルリクエスト更新",
            "プルリクエストコメント追加",
          ],
        },
      });
    } catch (error) {
      console.error("Webhook情報取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "Webhook情報の取得中にエラーが発生しました",
      });
    }
  };

  /**
   * プルリクエストのレビュー履歴を取得
   */
  getPullRequestReviewHistory = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const projectKey = req.params.projectKey;
      const repoName = req.params.repoName;
      const pullRequestId = parseInt(req.params.pullRequestId);

      if (!projectKey || !repoName || isNaN(pullRequestId)) {
        res.status(400).json({
          success: false,
          message: "プロジェクトキー、リポジトリ名、プルリクエストIDは必須です",
        });
        return;
      }

      const history =
        await this.pullRequestMonitoringService.getPullRequestReviewHistory(
          projectKey,
          repoName,
          pullRequestId
        );

      if (!history) {
        res.status(404).json({
          success: false,
          message: "プルリクエストのレビュー履歴が見つかりません",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error("レビュー履歴取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "プルリクエストのレビュー履歴取得中にエラーが発生しました",
        error: error instanceof Error ? error.message : "不明なエラー",
      });
    }
  };
}
