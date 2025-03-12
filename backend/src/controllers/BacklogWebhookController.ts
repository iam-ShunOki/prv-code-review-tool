// backend/src/controllers/BacklogWebhookController.ts
import { Request, Response } from "express";
import { PullRequestMonitoringService } from "../services/PullRequestMonitoringService";
import { WebhookUrlService } from "../services/WebhookUrlService"; // 追加

export class BacklogWebhookController {
  private pullRequestMonitoringService: PullRequestMonitoringService;
  private webhookUrlService: WebhookUrlService; // 追加

  constructor() {
    this.pullRequestMonitoringService = new PullRequestMonitoringService();
    this.webhookUrlService = WebhookUrlService.getInstance(); // 追加
  }

  /**
   * Backlogからのwebhookイベントを処理
   */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("Received webhook from Backlog:", req.body.type);
      const event = req.body;

      // テスト用のWebhookかどうかをチェック
      if (event.type === "test") {
        console.log("Received test webhook:", event);
        res.status(200).json({
          success: true,
          message: "Test webhook received successfully",
        });
        return;
      }

      // プルリクエストイベントかチェック
      if (event.type === "pull_request") {
        const content = event.content;

        // プルリクエスト作成または更新イベントかチェック
        if (
          content.changes &&
          (event.type === "pull_request_create" ||
            event.type === "pull_request_update")
        ) {
          const projectKey = content.project.projectKey;
          const repoName = content.repository.name;
          const pullRequestId = content.number;

          // プルリクエストをチェック
          await this.pullRequestMonitoringService.checkSinglePullRequest(
            projectKey,
            repoName,
            pullRequestId
          );
        }
      }

      res.status(200).json({
        success: true,
        message: "Webhook received and processed",
      });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({
        success: false,
        message: "Error processing webhook",
        error: error instanceof Error ? error.message : "Unknown error",
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
        message: "Existing pull requests checked",
        data: result,
        webhook_url: this.webhookUrlService.getWebhookUrl(
          "/api/backlog/webhook"
        ), // URLも返す
      });
    } catch (error) {
      console.error("Pull request check error:", error);
      res.status(500).json({
        success: false,
        message: "Error checking existing pull requests",
        error: error instanceof Error ? error.message : "Unknown error",
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
          triggers: ["プルリクエスト作成", "プルリクエスト更新"],
        },
      });
    } catch (error) {
      console.error("Webhook info error:", error);
      res.status(500).json({
        success: false,
        message: "Error getting webhook information",
      });
    }
  };
}
