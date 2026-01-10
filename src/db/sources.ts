import type Database from 'better-sqlite3';
import type { Source } from '../config/schema.js';

export interface SourceRow {
  id: string;
  name: string;
  base_url: string;
  locale: string;
  last_synced_at: string | null;
  enabled: number;
}

export interface SourceWithStats extends Source {
  lastSyncedAt: Date | null;
  articleCount: number;
  chunkCount: number;
}

/**
 * Insert or update a source
 */
export function upsertSource(db: Database.Database, source: Source): void {
  const stmt = db.prepare(`
    INSERT INTO sources (id, name, base_url, locale, enabled)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url,
      locale = excluded.locale,
      enabled = excluded.enabled
  `);

  stmt.run(
    source.id,
    source.name,
    source.baseUrl,
    source.locale,
    source.enabled ? 1 : 0
  );
}

/**
 * Get a source by ID
 */
export function getSource(db: Database.Database, id: string): Source | null {
  const stmt = db.prepare('SELECT * FROM sources WHERE id = ?');
  const row = stmt.get(id) as SourceRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    locale: row.locale,
    enabled: row.enabled === 1,
  };
}

/**
 * Get all sources
 */
export function getAllSources(db: Database.Database): Source[] {
  const stmt = db.prepare('SELECT * FROM sources ORDER BY name');
  const rows = stmt.all() as SourceRow[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    locale: row.locale,
    enabled: row.enabled === 1,
  }));
}

/**
 * Get enabled sources only
 */
export function getEnabledSources(db: Database.Database): Source[] {
  const stmt = db.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY name');
  const rows = stmt.all() as SourceRow[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    locale: row.locale,
    enabled: true,
  }));
}

/**
 * Get sources with statistics
 */
export function getSourcesWithStats(db: Database.Database): SourceWithStats[] {
  const stmt = db.prepare(`
    SELECT
      s.*,
      COUNT(DISTINCT a.id) as article_count,
      COUNT(c.id) as chunk_count
    FROM sources s
    LEFT JOIN articles a ON s.id = a.source_id
    LEFT JOIN chunks c ON a.id = c.article_id AND a.source_id = c.source_id
    GROUP BY s.id
    ORDER BY s.name
  `);

  const rows = stmt.all() as Array<SourceRow & { article_count: number; chunk_count: number }>;

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    locale: row.locale,
    enabled: row.enabled === 1,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    articleCount: row.article_count,
    chunkCount: row.chunk_count,
  }));
}

/**
 * Delete a source and all its data
 */
export function deleteSource(db: Database.Database, id: string): void {
  // Foreign key constraints will cascade delete articles and chunks
  const stmt = db.prepare('DELETE FROM sources WHERE id = ?');
  stmt.run(id);
}

/**
 * Update source enabled status
 */
export function setSourceEnabled(db: Database.Database, id: string, enabled: boolean): void {
  const stmt = db.prepare('UPDATE sources SET enabled = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, id);
}

/**
 * Update last synced timestamp
 */
export function updateLastSynced(db: Database.Database, id: string): void {
  const stmt = db.prepare('UPDATE sources SET last_synced_at = ? WHERE id = ?');
  stmt.run(new Date().toISOString(), id);
}
