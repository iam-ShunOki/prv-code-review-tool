// backend/src/services/CodeEmbeddingService.ts (拡張版)
import { AppDataSource } from "../index";
import { CodeEmbedding } from "../models/CodeEmbedding";
import { CodeSubmission } from "../models/CodeSubmission";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";

export class CodeEmbeddingService {
  private embedRepository = AppDataSource.getRepository(CodeEmbedding);
  private embeddings: OpenAIEmbeddings;
  private chromaClient: Map<string, Chroma> = new Map();
  private defaultCollectionName = "code_review_submissions";

  constructor() {
    // OpenAI Embeddingsを初期化
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-ada-002",
    });
  }

  /**
   * コード提出をベクトル化して保存
   */
  async createEmbedding(submission: CodeSubmission): Promise<CodeEmbedding> {
    try {
      // Chromaクライアントの初期化（初回のみ）
      if (!this.chromaClient.has(this.defaultCollectionName)) {
        await this.initChromaClient(this.defaultCollectionName);
      }

      // コードをドキュメントとして準備
      const document = new Document({
        pageContent: submission.code_content,
        metadata: {
          submission_id: submission.id,
          review_id: submission.review_id,
          version: submission.version,
        },
      });

      // ベクトルストアに追加
      const chromaClient = this.chromaClient.get(this.defaultCollectionName);
      const ids = await chromaClient!.addDocuments([document]);
      const embeddingId = ids[0];

      // DBにエンベディング情報を保存
      const codeEmbedding = new CodeEmbedding();
      codeEmbedding.submission_id = submission.id;
      codeEmbedding.embedding_id = embeddingId;

      return this.embedRepository.save(codeEmbedding);
    } catch (error) {
      console.error("Error creating code embedding:", error);
      throw error;
    }
  }

  /**
   * 任意のコードコンテンツをベクトル化（リポジトリ用）
   */
  async createEmbeddingFromCode(
    codeContent: string,
    collectionName: string = this.defaultCollectionName,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    try {
      // Chromaクライアントの初期化（初回のみ）
      if (!this.chromaClient.has(collectionName)) {
        await this.initChromaClient(collectionName);
      }

      // コードをドキュメントとして準備
      const document = new Document({
        pageContent: codeContent,
        metadata: metadata,
      });

      // ベクトルストアに追加
      const chromaClient = this.chromaClient.get(collectionName);
      const ids = await chromaClient!.addDocuments([document]);
      return ids[0];
    } catch (error) {
      console.error("Error creating code embedding from content:", error);
      throw error;
    }
  }

  /**
   * ベクトル類似度検索
   */
  async similarCodeSearch(
    query: string,
    limit: number = 5,
    collectionName: string = this.defaultCollectionName
  ): Promise<{ document: Document; score: number }[]> {
    try {
      if (!this.chromaClient.has(collectionName)) {
        await this.initChromaClient(collectionName);
      }

      const chromaClient = this.chromaClient.get(collectionName);
      const results = await chromaClient!.similaritySearchWithScore(
        query,
        limit
      );
      return results.map(([doc, score]) => ({
        document: doc,
        score: score,
      }));
    } catch (error) {
      console.error("Error searching similar code:", error);
      return [];
    }
  }

  /**
   * 特定の提出IDに関連するエンベディングを取得
   */
  async getEmbeddingBySubmissionId(
    submissionId: number
  ): Promise<CodeEmbedding | null> {
    return this.embedRepository.findOne({
      where: { submission_id: submissionId },
    });
  }

  /**
   * 特定のコレクションをクリア
   */
  async clearCollection(collectionName: string): Promise<void> {
    try {
      if (!this.chromaClient.has(collectionName)) {
        await this.initChromaClient(collectionName);
      }

      const chromaClient = this.chromaClient.get(collectionName);
      // 空のオブジェクトを渡して全てのドキュメントを削除
      await chromaClient!.delete({
        ids: [], // 空の配列を渡すと全てのドキュメントが対象になる
      });

      // クライアントキャッシュも更新
      this.chromaClient.delete(collectionName);
      await this.initChromaClient(collectionName);

      console.log(`Collection ${collectionName} has been cleared`);
    } catch (error) {
      console.error(`Error clearing collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Chromaクライアントの初期化
   */
  private async initChromaClient(collectionName: string): Promise<void> {
    try {
      const chromaUrl = `http://${process.env.CHROMA_HOST || "localhost"}:${
        process.env.CHROMA_PORT || "8000"
      }`;
      const persistDirectory =
        process.env.CHROMA_PERSIST_DIR || "./vector-db/data";

      console.log(
        `Connecting to Chroma at ${chromaUrl} for collection ${collectionName}`
      );
      console.log(`Using persist directory: ${persistDirectory}`);

      try {
        // 既存のコレクションに接続 - 永続ディレクトリを指定
        const client = await Chroma.fromExistingCollection(this.embeddings, {
          collectionName: collectionName,
          url: chromaUrl,
          collectionMetadata: {
            "hnsw:space": "cosine",
          },
        });
        this.chromaClient.set(collectionName, client);
        console.log(
          `Successfully connected to existing collection: ${collectionName}`
        );
      } catch (error) {
        console.error(
          `Failed to connect to existing collection ${collectionName}, creating new one.`
        );

        // コレクションが存在しない場合は新規作成 - 永続ディレクトリを指定
        const client = await Chroma.fromDocuments(
          [], // 空のドキュメント配列
          this.embeddings,
          {
            collectionName: collectionName,
            url: chromaUrl,
            collectionMetadata: {
              "hnsw:space": "cosine",
            },
          }
        );
        this.chromaClient.set(collectionName, client);
        console.log(`Successfully created new collection: ${collectionName}`);
      }
    } catch (error) {
      console.error(
        `Error initializing Chroma client for ${collectionName}:`,
        error
      );
      throw error;
    }
  }
}
