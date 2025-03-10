// backend/src/services/CodeEmbeddingService.ts
import { AppDataSource } from "../index";
import { CodeEmbedding } from "../models/CodeEmbedding";
import { CodeSubmission } from "../models/CodeSubmission";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";

export class CodeEmbeddingService {
  private embedRepository = AppDataSource.getRepository(CodeEmbedding);
  private embeddings: OpenAIEmbeddings;
  private chromaClient: Chroma | null = null;
  private collectionName = "code_review_submissions";

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
      if (!this.chromaClient) {
        await this.initChromaClient();
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
      const ids = await this.chromaClient!.addDocuments([document]);
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
   * ベクトル類似度検索
   */
  async similarCodeSearch(
    query: string,
    limit: number = 5
  ): Promise<{ document: Document; score: number }[]> {
    try {
      if (!this.chromaClient) {
        await this.initChromaClient();
      }

      const results = await this.chromaClient!.similaritySearch(query, limit);
      return results.map((doc, i) => ({
        document: doc,
        score: 1.0 - i * 0.1, // スコアを簡易的に計算（実際には正確な類似度が望ましい）
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
   * Chromaクライアントの初期化
   */
  private async initChromaClient(): Promise<void> {
    try {
      const chromaUrl = `http://${process.env.CHROMA_HOST}:${process.env.CHROMA_PORT}`;
      console.log(`Connecting to Chroma at ${chromaUrl}`);

      this.chromaClient = await Chroma.fromExistingCollection(this.embeddings, {
        collectionName: this.collectionName,
        url: chromaUrl,
      });
    } catch (error) {
      console.error(
        "Failed to connect to existing collection, creating new one."
      );

      // コレクションが存在しない場合は新規作成
      this.chromaClient = await Chroma.fromDocuments(
        [], // 空のドキュメント配列
        this.embeddings,
        {
          collectionName: this.collectionName,
          url: `http://${process.env.CHROMA_HOST}:${process.env.CHROMA_PORT}`,
        }
      );
    }
  }
}
