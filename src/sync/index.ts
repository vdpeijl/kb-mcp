import type Database from 'better-sqlite3';
import type { Config, Source } from '../config/schema.js';
import { fetchAllArticles, fetchSections, fetchCategories } from './zendesk.js';
import { parseHTMLStructured } from './parser.js';
import { chunkText } from './chunker.js';
import { generateEmbeddingsBatch } from '../search/embeddings.js';
import { upsertArticle, getStaleArticleIds, deleteArticle } from '../db/articles.js';
import { deleteChunksByArticle, insertChunksBatch } from '../db/chunks.js';
import { updateLastSynced } from '../db/sources.js';
import type { ChunkWithEmbedding } from '../db/chunks.js';

export interface SyncProgress {
  phase: 'fetching' | 'parsing' | 'chunking' | 'embedding' | 'storing';
  current: number;
  total: number;
  message: string;
}

export interface SyncResult {
  source: string;
  articlesProcessed: number;
  articlesFetched: number;
  chunksCreated: number;
  timeElapsed: number;
}

/**
 * Sync a single source
 */
export async function syncSource(
  db: Database.Database,
  source: Source,
  config: Config,
  onProgress?: (progress: SyncProgress) => void,
  fullResync: boolean = false
): Promise<SyncResult> {
  const startTime = Date.now();

  // Phase 1: Fetch articles
  onProgress?.({
    phase: 'fetching',
    current: 0,
    total: 0,
    message: `Fetching articles from ${source.name}...`,
  });

  const articles = await fetchAllArticles(source, (fetched) => {
    onProgress?.({
      phase: 'fetching',
      current: fetched,
      total: fetched,
      message: `Fetched ${fetched} articles from ${source.name}...`,
    });
  });

  // Fetch sections and categories for metadata
  const [sections, categories] = await Promise.all([
    fetchSections(source),
    fetchCategories(source),
  ]);

  // Phase 2: Determine which articles need processing
  const articleSummaries = articles.map(a => ({ id: a.id, updated_at: a.updated_at }));
  const staleIds = fullResync
    ? new Set(articles.map(a => a.id))
    : getStaleArticleIds(db, source.id, articleSummaries);

  const articlesToProcess = articles.filter(a => staleIds.has(a.id));

  if (articlesToProcess.length === 0) {
    onProgress?.({
      phase: 'storing',
      current: articles.length,
      total: articles.length,
      message: 'All articles are up to date.',
    });

    return {
      source: source.name,
      articlesProcessed: 0,
      articlesFetched: articles.length,
      chunksCreated: 0,
      timeElapsed: Date.now() - startTime,
    };
  }

  // Phase 3: Parse, chunk, and prepare for embedding
  onProgress?.({
    phase: 'parsing',
    current: 0,
    total: articlesToProcess.length,
    message: `Processing ${articlesToProcess.length} articles...`,
  });

  interface ArticleChunks {
    articleId: number;
    title: string;
    url: string;
    sectionName?: string;
    categoryName?: string;
    updatedAt: Date;
    chunks: Array<{ text: string; index: number; tokenCount: number }>;
  }

  const allArticleChunks: ArticleChunks[] = [];

  for (let i = 0; i < articlesToProcess.length; i++) {
    const article = articlesToProcess[i];

    // Parse HTML
    const cleanText = parseHTMLStructured(article.body);

    // Chunk text
    const chunks = chunkText(
      cleanText,
      article.title,
      config.sync.chunkSize,
      config.sync.chunkOverlap
    );

    allArticleChunks.push({
      articleId: article.id,
      title: article.title,
      url: article.html_url,
      sectionName: sections.get(article.section_id),
      categoryName: categories.get(article.section_id),
      updatedAt: new Date(article.updated_at),
      chunks,
    });

    onProgress?.({
      phase: 'parsing',
      current: i + 1,
      total: articlesToProcess.length,
      message: `Parsed ${i + 1}/${articlesToProcess.length} articles...`,
    });
  }

  // Phase 4: Generate embeddings
  const allChunkTexts = allArticleChunks.flatMap(ac => ac.chunks.map(c => c.text));
  const totalChunks = allChunkTexts.length;

  onProgress?.({
    phase: 'embedding',
    current: 0,
    total: totalChunks,
    message: `Generating embeddings for ${totalChunks} chunks...`,
  });

  const embeddings = await generateEmbeddingsBatch(
    allChunkTexts,
    config.ollama,
    5,
    (completed, total) => {
      onProgress?.({
        phase: 'embedding',
        current: completed,
        total,
        message: `Generated ${completed}/${total} embeddings...`,
      });
    }
  );

  // Phase 5: Store in database
  onProgress?.({
    phase: 'storing',
    current: 0,
    total: articlesToProcess.length,
    message: 'Storing articles and chunks...',
  });

  // Use a transaction for all database operations
  const storeTransaction = db.transaction(() => {
    let embeddingIndex = 0;

    for (let i = 0; i < allArticleChunks.length; i++) {
      const articleChunks = allArticleChunks[i];

      // Delete old chunks for this article
      deleteChunksByArticle(db, articleChunks.articleId, source.id);

      // Upsert article
      upsertArticle(db, {
        id: articleChunks.articleId,
        sourceId: source.id,
        title: articleChunks.title,
        url: articleChunks.url,
        sectionName: articleChunks.sectionName,
        categoryName: articleChunks.categoryName,
        updatedAt: articleChunks.updatedAt,
      });

      // Prepare chunks with embeddings
      const chunksWithEmbeddings: ChunkWithEmbedding[] = articleChunks.chunks.map(chunk => ({
        articleId: articleChunks.articleId,
        sourceId: source.id,
        chunkIndex: chunk.index,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[embeddingIndex++],
      }));

      // Insert chunks
      insertChunksBatch(db, chunksWithEmbeddings);

      onProgress?.({
        phase: 'storing',
        current: i + 1,
        total: articlesToProcess.length,
        message: `Stored ${i + 1}/${articlesToProcess.length} articles...`,
      });
    }

    // Delete articles that no longer exist in Zendesk
    const validArticleIds = articles.map(a => a.id);
    const currentArticleIds = db
      .prepare('SELECT id FROM articles WHERE source_id = ?')
      .all(source.id) as Array<{ id: number }>;

    for (const { id } of currentArticleIds) {
      if (!validArticleIds.includes(id)) {
        deleteArticle(db, id, source.id);
      }
    }

    // Update last synced timestamp
    updateLastSynced(db, source.id);
  });

  storeTransaction();

  const timeElapsed = Date.now() - startTime;

  return {
    source: source.name,
    articlesProcessed: articlesToProcess.length,
    articlesFetched: articles.length,
    chunksCreated: totalChunks,
    timeElapsed,
  };
}

/**
 * Sync all enabled sources
 */
export async function syncAllSources(
  db: Database.Database,
  sources: Source[],
  config: Config,
  onProgress?: (source: string, progress: SyncProgress) => void,
  fullResync: boolean = false
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const source of sources) {
    if (!source.enabled) {
      continue;
    }

    const result = await syncSource(
      db,
      source,
      config,
      (progress) => onProgress?.(source.name, progress),
      fullResync
    );

    results.push(result);
  }

  return results;
}
