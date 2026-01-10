import type Database from 'better-sqlite3';

export interface Article {
  id: number;
  sourceId: string;
  title: string;
  url: string;
  sectionName?: string;
  categoryName?: string;
  updatedAt: Date;
}

interface ArticleRow {
  id: number;
  source_id: string;
  title: string;
  url: string;
  section_name: string | null;
  category_name: string | null;
  updated_at: string;
  synced_at: string;
}

/**
 * Insert or update an article
 */
export function upsertArticle(db: Database.Database, article: Article): void {
  const stmt = db.prepare(`
    INSERT INTO articles (id, source_id, title, url, section_name, category_name, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, source_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      section_name = excluded.section_name,
      category_name = excluded.category_name,
      updated_at = excluded.updated_at,
      synced_at = excluded.synced_at
  `);

  stmt.run(
    article.id,
    article.sourceId,
    article.title,
    article.url,
    article.sectionName || null,
    article.categoryName || null,
    article.updatedAt.toISOString(),
    new Date().toISOString()
  );
}

/**
 * Get an article by ID and source
 */
export function getArticle(db: Database.Database, id: number, sourceId: string): Article | null {
  const stmt = db.prepare('SELECT * FROM articles WHERE id = ? AND source_id = ?');
  const row = stmt.get(id, sourceId) as ArticleRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    sectionName: row.section_name || undefined,
    categoryName: row.category_name || undefined,
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Get all articles for a source
 */
export function getArticlesBySource(db: Database.Database, sourceId: string): Article[] {
  const stmt = db.prepare('SELECT * FROM articles WHERE source_id = ? ORDER BY updated_at DESC');
  const rows = stmt.all(sourceId) as ArticleRow[];

  return rows.map(row => ({
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    sectionName: row.section_name || undefined,
    categoryName: row.category_name || undefined,
    updatedAt: new Date(row.updated_at),
  }));
}

/**
 * Get articles that have been updated since last sync
 * Returns articles from Zendesk that are newer than what we have
 */
export function getStaleArticleIds(
  db: Database.Database,
  sourceId: string,
  freshArticles: Array<{ id: number; updated_at: string }>
): Set<number> {
  const staleIds = new Set<number>();

  // Get all current article IDs and their update times
  const stmt = db.prepare('SELECT id, updated_at FROM articles WHERE source_id = ?');
  const existingArticles = stmt.all(sourceId) as Array<{ id: number; updated_at: string }>;

  const existingMap = new Map(existingArticles.map(a => [a.id, new Date(a.updated_at)]));

  // Check each fresh article
  for (const fresh of freshArticles) {
    const existing = existingMap.get(fresh.id);
    const freshDate = new Date(fresh.updated_at);

    // If article doesn't exist or has been updated, it's stale
    if (!existing || freshDate > existing) {
      staleIds.add(fresh.id);
    }

    // Remove from map so we can find deleted articles
    existingMap.delete(fresh.id);
  }

  // Any remaining articles in the map have been deleted from Zendesk
  // Add them to stale list so they get removed
  for (const [id] of existingMap) {
    staleIds.add(id);
  }

  return staleIds;
}

/**
 * Delete an article and its chunks
 */
export function deleteArticle(db: Database.Database, id: number, sourceId: string): void {
  // Foreign key constraints will cascade delete chunks
  const stmt = db.prepare('DELETE FROM articles WHERE id = ? AND source_id = ?');
  stmt.run(id, sourceId);
}

/**
 * Delete articles that no longer exist in Zendesk
 */
export function deleteOrphanedArticles(
  db: Database.Database,
  sourceId: string,
  validArticleIds: number[]
): void {
  if (validArticleIds.length === 0) {
    // Delete all articles for this source
    db.prepare('DELETE FROM articles WHERE source_id = ?').run(sourceId);
    return;
  }

  // Delete articles not in the valid list
  const placeholders = validArticleIds.map(() => '?').join(',');
  const stmt = db.prepare(
    `DELETE FROM articles WHERE source_id = ? AND id NOT IN (${placeholders})`
  );

  stmt.run(sourceId, ...validArticleIds);
}
