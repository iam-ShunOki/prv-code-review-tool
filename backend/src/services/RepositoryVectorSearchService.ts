// backend/src/services/RepositoryVectorSearchService.ts
import { AppDataSource } from "../index";
import { Document } from "@langchain/core/documents";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings } from "@langchain/openai";
import { BacklogService } from "./BacklogService";
import { CodeEmbedding } from "../models/CodeEmbedding";
import { CodeSubmission } from "../models/CodeSubmission";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const readFilePromise = promisify(fs.readFile);
const writeFilePromise = promisify(fs.writeFile);
const mkdirPromise = promisify(fs.mkdir);

export class RepositoryVectorSearchService {
  private embeddings: OpenAIEmbeddings;
  private backlogService: BacklogService;
  private codeEmbeddingRepository = AppDataSource.getRepository(CodeEmbedding);
  private submissionRepository = AppDataSource.getRepository(CodeSubmission);
  private vectorStoreDirectory = path.join(__dirname, "../../vector-db");
  private tempDirectory = path.join(__dirname, "../../temp");

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-ada-002",
    });
    this.backlogService = new BacklogService();

    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.vectorStoreDirectory)) {
      fs.mkdirSync(this.vectorStoreDirectory, { recursive: true });
    }
    if (!fs.existsSync(this.tempDirectory)) {
      fs.mkdirSync(this.tempDirectory, { recursive: true });
    }
  }

  /**
   * リポジトリのコードをベクトル化
   */
  async vectorizeRepository(
    projectKey: string,
    repositoryName: string,
    branch: string = "master"
  ): Promise<string> {
    const collectionName = `${projectKey}_${repositoryName}_${branch}`.replace(
      /[^a-zA-Z0-9_]/g,
      "_"
    );
    console.log(
      `Vectorizing repository: ${projectKey}/${repositoryName} (${branch}) into collection ${collectionName}`
    );

    let repoDir = "";
    try {
      // リポジトリをクローン
      repoDir = await this.backlogService.cloneRepository(
        projectKey,
        repositoryName,
        branch
      );
      console.log(`Cloned repository to ${repoDir}`);

      // ベクトルストアを初期化
      let vectorStore = await this.initializeVectorStore(collectionName);

      // コードファイルを検索して読み込み
      const documents = await this.loadRepositoryDocuments(repoDir);
      console.log(`Loaded ${documents.length} documents from repository`);

      if (documents.length > 0) {
        // ドキュメントをベクトルストアに追加
        await vectorStore.addDocuments(documents);
        console.log(`Added ${documents.length} documents to vector store`);
      }

      return collectionName;
    } catch (error) {
      console.error(
        `Error vectorizing repository ${projectKey}/${repositoryName}:`,
        error
      );
      throw error;
    } finally {
      // 一時ディレクトリの削除
      if (repoDir && fs.existsSync(repoDir)) {
        try {
          await this.backlogService.cleanupRepository(repoDir);
          console.log(`Cleaned up repository directory: ${repoDir}`);
        } catch (cleanupError) {
          console.error(
            "Error cleaning up repository directory:",
            cleanupError
          );
        }
      }
    }
  }

  /**
   * ベクトルストアで類似コードを検索
   */
  async searchSimilarCode(
    collectionName: string,
    query: string,
    limit: number = 5
  ): Promise<{ document: Document; score: number }[]> {
    try {
      // ベクトルストアを初期化
      const vectorStore = await this.initializeVectorStore(collectionName);

      // 類似度検索を実行
      const results = await vectorStore.similaritySearchWithScore(query, limit);

      // 検索結果を整形して返す
      return results.map(([doc, score]) => ({
        document: doc,
        score: score,
      }));
    } catch (error) {
      console.error(
        `Error searching similar code in collection ${collectionName}:`,
        error
      );
      return [];
    }
  }

  /**
   * リポジトリからドキュメントをロード
   */
  private async loadRepositoryDocuments(repoDir: string): Promise<Document[]> {
    const documents: Document[] = [];
    const supportedExtensions = [
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".cs",
      ".php",
      ".rb",
      ".go",
      ".swift",
      ".kt",
      ".html",
      ".css",
      ".scss",
      ".json",
      ".md",
      ".txt",
    ];

    // リポジトリディレクトリを再帰的に探索
    const exploreDirectory = async (
      dirPath: string,
      relativePath: string = ""
    ) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relPath = path.join(relativePath, entry.name);

        // ディレクトリの場合は再帰的に探索
        if (entry.isDirectory()) {
          // .git などの特定ディレクトリは除外
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            await exploreDirectory(fullPath, relPath);
          }
        }
        // ファイルの場合はサポートされている拡張子のみ処理
        else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            try {
              // ファイルを読み込みドキュメントとして追加
              const content = await readFilePromise(fullPath, "utf8");

              // サイズが大きすぎる場合は分割
              if (content.length > 8000) {
                // 長いファイルを複数のチャンクに分割
                const chunks = this.splitContentIntoChunks(content, 6000);
                chunks.forEach((chunk, index) => {
                  documents.push(
                    new Document({
                      pageContent: chunk,
                      metadata: {
                        source: relPath,
                        chunk: index + 1,
                        totalChunks: chunks.length,
                        extension: ext,
                      },
                    })
                  );
                });
              } else {
                documents.push(
                  new Document({
                    pageContent: content,
                    metadata: {
                      source: relPath,
                      extension: ext,
                    },
                  })
                );
              }
            } catch (error) {
              console.error(`Error reading file ${fullPath}:`, error);
            }
          }
        }
      }
    };

    await exploreDirectory(repoDir);
    return documents;
  }

  // 差分コードに関連する類似コードを検索するメソッド
  async searchSimilarCodeForDiff(
    collectionName: string,
    diffContent: string,
    limit: number = 5
  ): Promise<{ document: Document; score: number }[]> {
    try {
      // 差分から検索用のクリーンなコードを抽出（+/-などの記号を除去）
      const cleanedCode = this.extractCodeFromDiff(diffContent);

      // 類似度検索を実行
      return await this.searchSimilarCode(
        collectionName,
        cleanedCode.content,
        limit
      );
    } catch (error) {
      console.error(
        `Error searching similar code for diff in ${collectionName}:`,
        error
      );
      return [];
    }
  }

  // 改善されたdiffからのコード抽出関数
  private extractCodeFromDiff(diffText: string): {
    content: string;
    filePath: string | null;
  } {
    try {
      // diffのヘッダー部分から実際のファイル名を抽出
      let filePath = null;
      const filePathMatch = diffText.match(/\+\+\+ b\/(.*?)$/m);
      if (
        filePathMatch &&
        filePathMatch[1] &&
        filePathMatch[1] !== "/dev/null"
      ) {
        filePath = filePathMatch[1];
      }

      // diff行から実際のコード内容だけを抽出する
      const codeLines: string[] = [];
      const diffLines = diffText.split("\n");

      // チャンク見出し (@@) 以降を探す
      let inCodeSection = false;
      for (const line of diffLines) {
        if (line.startsWith("@@")) {
          inCodeSection = true;
          continue; // チャンク見出し行はスキップ
        }

        if (inCodeSection) {
          // 追加行 (+で始まる) から+を除去してコードとして追加
          if (line.startsWith("+")) {
            codeLines.push(line.substring(1));
          }
          // 削除行 (-で始まる) はスキップ
        }
      }

      // 抽出したコード行を結合
      return {
        content: codeLines.join("\n"),
        filePath,
      };
    } catch (error) {
      console.error("Error extracting code from git diff:", error);
      return {
        content: "",
        filePath: null,
      };
    }
  }

  /**
   * コードスニペットに類似したコードをベクトルDBから検索
   */
  /**
   * コードスニペットに類似したコードをベクトルDBから検索
   */
  async searchSimilarCodeBySnippet(
    collectionName: string,
    codeSnippet: string,
    limit: number = 3,
    excludeExactMatches: boolean = true
  ): Promise<{ content: string; metadata: any; score: number }[]> {
    try {
      console.log(`Searching similar code in collection: ${collectionName}`);

      // ベクトルストアを初期化
      const vectorStore = await this.initializeVectorStore(collectionName);

      // v0.3では、単純に similaritySearchWithScore を使用 (フィルタなし)
      const results = await vectorStore.similaritySearchWithScore(
        codeSnippet,
        limit * 2
      );

      // 結果を整形
      let processedResults = results.map(([doc, score]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score: score,
      }));

      // 完全一致や非常に類似度の高いものを除外
      if (excludeExactMatches) {
        processedResults = processedResults.filter(
          (item) =>
            !(item.content.trim() === codeSnippet.trim() || item.score > 0.98)
        );
      }

      // スコアでソートして上限数まで返す
      return processedResults
        .sort((a, b) => a.score - b.score) // スコアが低いほど類似度が高い
        .slice(0, limit);
    } catch (error) {
      console.error(
        `Error searching similar code in collection ${collectionName}:`,
        error
      );
      return [];
    }
  }

  /**
   * ファイルパスに関連するコードを検索
   */
  async searchSimilarCodeByFilePath(
    collectionName: string,
    filePath: string,
    limit: number = 2
  ): Promise<{ content: string; metadata: any; score: number }[]> {
    try {
      console.log(
        `Searching by file path for ${filePath} in collection: ${collectionName}`
      );

      // ベクトルストアを初期化
      const vectorStore = await this.initializeVectorStore(collectionName);

      // ファイル名を抽出
      const fileName = path.basename(filePath);

      // v0.3では、まず検索を行い、その後にフィルタリング
      // フィルタを指定せずに検索を実行
      const results = await vectorStore.similaritySearch(fileName, limit * 5);

      // 結果を手動でフィルタリング
      const filteredResults = results.filter((doc) => {
        // source メタデータがあるか確認
        if (!doc.metadata || !doc.metadata.source) return false;

        const source = String(doc.metadata.source);
        // ファイル名を含むものだけをフィルタリング
        return (
          source.includes(fileName) || path.basename(source).includes(fileName)
        );
      });

      // 整形して返す
      return filteredResults.slice(0, limit).map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score: 0.5, // 実際のスコアがないため固定値
      }));
    } catch (error) {
      console.error(
        `Error searching by file path in ${collectionName}:`,
        error
      );
      return [];
    }
  }

  /**
   * テキストを複数のチャンクに分割
   */
  private splitContentIntoChunks(content: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const lines = content.split("\n");

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * ベクトルストアを初期化
   */
  private async initializeVectorStore(collectionName: string): Promise<Chroma> {
    try {
      // v0.3でのChroma初期化
      const chromaUrl = `http://${process.env.CHROMA_HOST || "localhost"}:${
        process.env.CHROMA_PORT || "8000"
      }`;

      console.log(
        `Connecting to Chroma at ${chromaUrl} for collection ${collectionName}`
      );

      try {
        // 既存のコレクションへの接続試行
        return await Chroma.fromExistingCollection(
          new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: "text-embedding-ada-002",
          }),
          {
            collectionName: collectionName,
            url: chromaUrl,
          }
        );
      } catch (error) {
        console.log(`Creating new collection: ${collectionName}`);

        // 新規コレクション作成
        return await Chroma.fromDocuments(
          [], // 空のドキュメント配列
          new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: "text-embedding-ada-002",
          }),
          {
            collectionName: collectionName,
            url: chromaUrl,
          }
        );
      }
    } catch (error) {
      console.error(
        `Error initializing vector store for ${collectionName}:`,
        error
      );
      throw error;
    }
  }
}
