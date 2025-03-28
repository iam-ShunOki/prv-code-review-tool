// backend/src/controllers/BacklogWebhookController.ts
import { Request, Response } from "express";
import { PullRequestMonitoringService } from "../services/PullRequestMonitoringService";
import { WebhookUrlService } from "../services/WebhookUrlService";
import { BacklogService } from "../services/BacklogService";
import { MentionDetectionService } from "../services/MentionDetectionService";
import { AutomaticReviewCreator } from "../services/AutomaticReviewCreator";
import { AppDataSource } from "../index";
import { Review } from "../models/Review";
export class BacklogWebhookController {
  private pullRequestMonitoringService: PullRequestMonitoringService;
  private webhookUrlService: WebhookUrlService;
  private backlogService: BacklogService;
  private mentionDetectionService: MentionDetectionService;
  private automaticReviewCreator: AutomaticReviewCreator;
  private reviewRepository = AppDataSource.getRepository(Review);

  constructor() {
    this.pullRequestMonitoringService = new PullRequestMonitoringService();
    this.webhookUrlService = WebhookUrlService.getInstance();
    this.backlogService = new BacklogService();
    this.mentionDetectionService = new MentionDetectionService();
    this.automaticReviewCreator = new AutomaticReviewCreator();
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
        const commentId = content.comment?.id; // コメントID

        if (!commentId) {
          console.log("コメントIDがありません。スキップします");
          res.status(200).json({ success: true });
          return;
        }

        console.log(
          `PR #${pullRequestId} へのコメント(ID: ${commentId})を受信しました。@codereviewをチェックします`
        );

        // PR詳細を取得してステータスを確認
        try {
          const prDetails = await this.backlogService.getPullRequestById(
            projectKey,
            repoName,
            pullRequestId
          );

          // PRのステータスをチェック
          if (
            prDetails.status &&
            (prDetails.status.name === "Closed" ||
              prDetails.status.name === "Merged")
          ) {
            console.log(
              `PR #${pullRequestId} は ${prDetails.status.name} 状態のためスキップします`
            );
            res.status(200).json({
              success: true,
              message: `PR #${pullRequestId} は ${prDetails.status.name} 状態のためスキップしました`,
            });
            return;
          }

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
        } catch (prError) {
          console.error(
            `PR #${pullRequestId} の詳細取得中にエラーが発生しました:`,
            prError
          );
          res.status(500).json({
            success: false,
            message: "PRの詳細取得中にエラーが発生しました",
            error: prError instanceof Error ? prError.message : "不明なエラー",
          });
          return;
        }
      } else if (
        event.type === "pull_request_create" ||
        event.type === "pull_request_update"
      ) {
        // プルリクエスト作成/更新イベント処理
        const content = event.content;
        const projectKey = content.project.projectKey;
        const repoName = content.repository.name;
        const pullRequestId = content.number;
        const description = content.description || "";

        // PRステータスを確認する前に@codereviewメンションがあるか確認
        if (this.mentionDetectionService.detectCodeReviewMention(description)) {
          // プルリクエストの詳細情報を取得
          try {
            const prDetails = await this.backlogService.getPullRequestById(
              projectKey,
              repoName,
              pullRequestId
            );

            // PRのステータスをチェック
            if (
              prDetails.status &&
              (prDetails.status.name === "Closed" ||
                prDetails.status.name === "Merged")
            ) {
              console.log(
                `PR #${pullRequestId} は ${prDetails.status.name} 状態のためスキップします`
              );
              res.status(200).json({
                success: true,
                message: `PR #${pullRequestId} は ${prDetails.status.name} 状態のためスキップしました`,
              });
              return;
            }

            console.log(
              `PR #${pullRequestId} の説明に @codereview メンションがありました。レビューを実行します`
            );

            // 既存レビューを確認
            const existingReview = await this.reviewRepository.findOne({
              where: {
                backlog_pr_id: pullRequestId,
                backlog_project: projectKey,
                backlog_repository: repoName,
              },
            });

            // レビュー作成または更新
            await this.automaticReviewCreator.createReviewFromPullRequest(
              {
                id: prDetails.id,
                project: projectKey,
                repository: repoName,
                number: prDetails.number,
                summary: prDetails.summary,
                description: prDetails.description || "",
                base: prDetails.base,
                branch: prDetails.branch,
                authorId: prDetails.createdUser?.id,
                authorName: prDetails.createdUser?.name,
                authorMailAddress: prDetails.createdUser?.mailAddress || null,
              },
              {
                isReReview: existingReview !== null,
                existingReviewId: existingReview?.id,
              }
            );
          } catch (prError) {
            console.error(
              `PR #${pullRequestId} の詳細取得中にエラーが発生しました:`,
              prError
            );
            res.status(500).json({
              success: false,
              message: "PRの詳細取得中にエラーが発生しました",
              error:
                prError instanceof Error ? prError.message : "不明なエラー",
            });
            return;
          }
        }
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
