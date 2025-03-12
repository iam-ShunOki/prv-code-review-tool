// backend/src/services/WebhookUrlService.ts
import fs from "fs";
import path from "path";

/**
 * Webhook URLを管理するサービス
 * 開発環境でngrokを使用する場合など、動的に変わるURLを管理するために使用
 */
export class WebhookUrlService {
  private static instance: WebhookUrlService;
  private baseUrl: string;
  private urlStoragePath: string;

  private constructor() {
    // 初期値として環境変数のURLを使用
    this.baseUrl = process.env.WEBHOOK_BASE_URL || "http://localhost:3001";

    // 保存用ファイルパスを設定
    this.urlStoragePath = path.join(__dirname, "../../.webhook-url");

    // 保存されたURLがあれば読み込む
    this.loadSavedUrl();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): WebhookUrlService {
    if (!WebhookUrlService.instance) {
      WebhookUrlService.instance = new WebhookUrlService();
    }
    return WebhookUrlService.instance;
  }

  /**
   * 保存されたWebhook URLを読み込む
   */
  private loadSavedUrl(): void {
    try {
      if (fs.existsSync(this.urlStoragePath)) {
        const savedUrl = fs.readFileSync(this.urlStoragePath, "utf8").trim();
        if (savedUrl && this.isValidUrl(savedUrl)) {
          this.baseUrl = savedUrl;
          console.log(`Loaded saved webhook URL: ${this.baseUrl}`);
        }
      }
    } catch (error) {
      console.error("Error loading saved webhook URL:", error);
    }
  }

  /**
   * URLの形式が有効かチェック
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 現在のWebhook Base URLを取得
   */
  getWebhookBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Webhook URLを特定のエンドポイント用に生成
   */
  getWebhookUrl(endpoint: string = "/api/backlog/webhook"): string {
    // URLが/で終わっていれば、それを考慮
    const baseUrl = this.baseUrl.endsWith("/")
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;
    const normalizedEndpoint = endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;
    return `${baseUrl}${normalizedEndpoint}`;
  }

  /**
   * Webhook URLを更新
   */
  updateWebhookBaseUrl(url: string): boolean {
    if (!this.isValidUrl(url)) {
      return false;
    }

    this.baseUrl = url;

    // 新しいURLを保存
    try {
      fs.writeFileSync(this.urlStoragePath, url);
      console.log(`Updated webhook URL to: ${url}`);
      return true;
    } catch (error) {
      console.error("Error saving webhook URL:", error);
      return false;
    }
  }
}
