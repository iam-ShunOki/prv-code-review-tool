// backend/src/controllers/WebhookController.ts
import { Request, Response } from "express";
import { z } from "zod";
import { WebhookUrlService } from "../services/WebhookUrlService";
import axios from "axios";

export class WebhookController {
  private webhookUrlService: WebhookUrlService;

  constructor() {
    this.webhookUrlService = WebhookUrlService.getInstance();
  }

  /**
   * 現在のWebhook URLを取得
   */
  getWebhookUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const baseUrl = this.webhookUrlService.getWebhookBaseUrl();
      const backlogWebhookUrl = this.webhookUrlService.getWebhookUrl(
        "/api/backlog/webhook"
      );

      res.status(200).json({
        success: true,
        data: {
          baseUrl,
          endpoints: {
            backlog: backlogWebhookUrl,
          },
        },
      });
    } catch (error) {
      console.error("Webhook URL取得エラー:", error);
      res.status(500).json({
        success: false,
        message: "Webhook URLの取得中にエラーが発生しました",
      });
    }
  };

  /**
   * Webhook URLを更新
   */
  updateWebhookUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      const urlSchema = z.object({
        url: z.string().url("有効なURLを入力してください"),
      });

      const validatedData = urlSchema.parse(req.body);
      const result = this.webhookUrlService.updateWebhookBaseUrl(
        validatedData.url
      );

      if (!result) {
        res.status(400).json({
          success: false,
          message: "Webhook URLの更新に失敗しました",
        });
        return;
      }

      const backlogWebhookUrl = this.webhookUrlService.getWebhookUrl(
        "/api/backlog/webhook"
      );

      res.status(200).json({
        success: true,
        message: "Webhook URLを更新しました",
        data: {
          baseUrl: validatedData.url,
          endpoints: {
            backlog: backlogWebhookUrl,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "バリデーションエラー",
          errors: error.errors,
        });
      } else {
        console.error("Webhook URL更新エラー:", error);
        res.status(500).json({
          success: false,
          message: "Webhook URLの更新中にエラーが発生しました",
        });
      }
    }
  };

  /**
   * Webhook URLをngrokから自動検出
   */
  detectNgrokUrl = async (req: Request, res: Response): Promise<void> => {
    try {
      // ngrokのAPIエンドポイントを呼び出して現在のトンネル情報を取得
      try {
        const response = await axios.get("http://localhost:4040/api/tunnels");
        const tunnels = response.data.tunnels;

        // HTTPSのトンネルを探す
        const httpsTunnel = tunnels.find(
          (tunnel: any) =>
            tunnel.proto === "https" && tunnel.public_url.includes("ngrok")
        );

        if (httpsTunnel) {
          const ngrokUrl = httpsTunnel.public_url;
          this.webhookUrlService.updateWebhookBaseUrl(ngrokUrl);

          const backlogWebhookUrl = this.webhookUrlService.getWebhookUrl(
            "/api/backlog/webhook"
          );

          res.status(200).json({
            success: true,
            message: "ngrok URLを検出して更新しました",
            data: {
              baseUrl: ngrokUrl,
              endpoints: {
                backlog: backlogWebhookUrl,
              },
            },
          });
          return;
        }
      } catch (error) {
        console.error("ngrok API呼び出しエラー:", error);
      }

      // ngrokが見つからない場合
      res.status(404).json({
        success: false,
        message:
          "ngrokが実行されていないか、APIがアクセスできません。ngrokを起動してから再度試してください。",
      });
    } catch (error) {
      console.error("ngrok URL検出エラー:", error);
      res.status(500).json({
        success: false,
        message: "ngrok URLの検出中にエラーが発生しました",
      });
    }
  };

  /**
   * Webhook URLをテスト
   */
  testWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const backlogWebhookUrl = this.webhookUrlService.getWebhookUrl(
        "/api/backlog/webhook"
      );

      // 簡易的なテスト用のデータを作成
      const testData = {
        type: "test",
        created: new Date().toISOString(),
        content: {
          message: "This is a test webhook from the admin panel",
        },
      };

      try {
        // ローカルのエンドポイントを直接呼び出す
        // 注: 実際にはngrokなどの外部URLを使用する場合、直接ローカルのエンドポイントを叩く
        await axios.post("http://localhost:3001/api/backlog/webhook", testData);

        res.status(200).json({
          success: true,
          message: "テスト用Webhookを送信しました",
          data: {
            url: backlogWebhookUrl,
            payload: testData,
          },
        });
      } catch (error) {
        console.error("Webhook送信エラー:", error);
        res.status(500).json({
          success: false,
          message: "テスト用Webhookの送信に失敗しました",
        });
      }
    } catch (error) {
      console.error("Webhookテストエラー:", error);
      res.status(500).json({
        success: false,
        message: "Webhookのテスト中にエラーが発生しました",
      });
    }
  };
}
