import type Database from 'better-sqlite3';

export interface Chunk {
  id?: number;
  articleId: number;
  sourceId: string;
  chunkIndex: number;
  text: string;
  tokenCount: number;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: Float32Array;
}

interface ChunkRow {
  id: number;
  article_id: number;
  source_id: string;
  chunk_index: number;
  text: string;
  token_count: number;
}

/**
 * Insert a chunk with its embedding
 */
export function insertChunk(db: Database.Database, chunk: ChunkWithEmbedding): number {
  // Insert chunk
  const insertChunk = db.prepare(`
    INSERT INTO chunks (article_id, source_id, chunk_index, text, token_count)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = insertChunk.run(
    chunk.articleId,
    chunk.sourceId,
    chunk.chunkIndex,
    chunk.text,
    chunk.tokenCount
  );

  // Explicitly convert to integer (lastInsertRowid can be bigint)
  const chunkId = Math.floor(Number(result.lastInsertRowid));

  // Insert embedding into vector table
  // vec0 uses rowid as the primary key
  // Use CAST to ensure rowid is treated as INTEGER
  const insertVec = db.prepare(`
    INSERT INTO chunks_vec (rowid, embedding)
    VALUES (CAST(? AS INTEGER), ?)
  `);

  // Convert Float32Array to buffer for sqlite-vec
  const embeddingBuffer = Buffer.from(chunk.embedding.buffer);
  insertVec.run(chunkId, embeddingBuffer);

  return chunkId;
}

/**
 * Insert multiple chunks in a transaction
 */
export function insertChunksBatch(db: Database.Database, chunks: ChunkWithEmbedding[]): void {
  const transaction = db.transaction((chunks: ChunkWithEmbedding[]) => {
    for (const chunk of chunks) {
      insertChunk(db, chunk);
    }
  });

  transaction(chunks);
}

/**
 * Get chunks for an article
 */
export function getChunksByArticle(db: Database.Database, articleId: number, sourceId: string): Chunk[] {
  const stmt = db.prepare(`
    SELECT * FROM chunks
    WHERE article_id = ? AND source_id = ?
    ORDER BY chunk_index
  `);

  const rows = stmt.all(articleId, sourceId) as ChunkRow[];

  return rows.map(row => ({
    id: row.id,
    articleId: row.article_id,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    tokenCount: row.token_count,
  }));
}

/**
 * Delete all chunks for an article
 */
export function deleteChunksByArticle(db: Database.Database, articleId: number, sourceId: string): void {
  // Get chunk IDs to delete from vector table
  const chunkIds = db.prepare('SELECT id FROM chunks WHERE article_id = ? AND source_id = ?')
    .all(articleId, sourceId) as Array<{ id: number }>;

  // Delete from vector table
  if (chunkIds.length > 0) {
    const placeholders = chunkIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM chunks_vec WHERE rowid IN (${placeholders})`)
      .run(...chunkIds.map(c => c.id));
  }

  // Delete from chunks table
  db.prepare('DELETE FROM chunks WHERE article_id = ? AND source_id = ?')
    .run(articleId, sourceId);
}

/**
 * Delete all chunks for a source
 */
export function deleteChunksBySource(db: Database.Database, sourceId: string): void {
  // Get chunk IDs to delete from vector table
  const chunkIds = db.prepare('SELECT id FROM chunks WHERE source_id = ?')
    .all(sourceId) as Array<{ id: number }>;

  // Delete from vector table
  if (chunkIds.length > 0) {
    const placeholders = chunkIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM chunks_vec WHERE rowid IN (${placeholders})`)
      .run(...chunkIds.map(c => c.id));
  }

  // Delete from chunks table
  db.prepare('DELETE FROM chunks WHERE source_id = ?').run(sourceId);
}

export interface SearchResult {
  chunkId: number;
  articleId: number;
  sourceId: string;
  title: string;
  url: string;
  text: string;
  distance: number;
}

/**
 * Search for similar chunks using vector similarity
 */
export function searchSimilarChunks(
  db: Database.Database,
  embedding: Float32Array,
  limit: number = 5,
  sourceIds?: string[]
): SearchResult[] {
  const embeddingBuffer = Buffer.from(embedding.buffer);

  let query = `
    SELECT
      cv.rowid as chunk_id,
      c.article_id,
      c.source_id,
      c.text,
      a.title,
      a.url,
      cv.distance
    FROM chunks_vec cv
    INNER JOIN chunks c ON cv.rowid = c.id
    INNER JOIN articles a ON c.article_id = a.id AND c.source_id = a.source_id
    WHERE cv.embedding MATCH ? AND k = ?
  `;

  const params: any[] = [embeddingBuffer, limit];

  // Add source filter if provided
  if (sourceIds && sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => '?').join(',');
    query += ` AND c.source_id IN (${placeholders})`;
    params.push(...sourceIds);
  }

  query += `
    ORDER BY cv.distance
  `;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<{
    chunk_id: number;
    article_id: number;
    source_id: string;
    text: string;
    title: string;
    url: string;
    distance: number;
  }>;

  return rows.map(row => ({
    chunkId: row.chunk_id,
    articleId: row.article_id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    text: row.text,
    distance: row.distance,
  }));
}
