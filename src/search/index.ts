import type Database from 'better-sqlite3';
import type { Config } from '../config/schema.js';
import { generateEmbedding } from './embeddings.js';
import { searchSimilarChunks, type SearchResult } from '../db/chunks.js';

export interface FormattedSearchResult {
  title: string;
  url: string;
  excerpt: string;
  sourceId: string;
  relevance: number;
}

/**
 * Search the knowledge base using vector similarity
 */
export async function search(
  db: Database.Database,
  config: Config,
  query: string,
  options: {
    sources?: string[];
    limit?: number;
  } = {}
): Promise<FormattedSearchResult[]> {
  const limit = Math.min(options.limit || 5, 20);

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query, config.ollama);

  // Search database
  const results = searchSimilarChunks(
    db,
    queryEmbedding,
    limit,
    options.sources
  );

  // Format results
  return results.map(formatSearchResult);
}

/**
 * Format a search result for display
 */
function formatSearchResult(result: SearchResult): FormattedSearchResult {
  // Calculate relevance score (inverse of distance, normalized to 0-1)
  // sqlite-vec uses cosine distance where 0 = identical, 2 = opposite
  const relevance = Math.max(0, 1 - (result.distance / 2));

  // Clean up excerpt (remove extra whitespace)
  const excerpt = result.text
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: result.title,
    url: result.url,
    excerpt,
    sourceId: result.sourceId,
    relevance,
  };
}

/**
 * Group search results by article to avoid duplicates
 */
export function deduplicateResults(results: FormattedSearchResult[]): FormattedSearchResult[] {
  const seen = new Map<string, FormattedSearchResult>();

  for (const result of results) {
    const key = result.url;

    // Keep the result with highest relevance
    const existing = seen.get(key);
    if (!existing || result.relevance > existing.relevance) {
      seen.set(key, result);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.relevance - a.relevance);
}
