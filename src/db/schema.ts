import type Database from 'better-sqlite3';

/**
 * Create all database tables and indexes
 */
export function createSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Set WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Set busy timeout (in milliseconds)
  db.pragma('busy_timeout = 5000');

  // Create sources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      locale TEXT NOT NULL,
      last_synced_at TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);

  // Create articles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      section_name TEXT,
      category_name TEXT,
      updated_at TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (id, source_id),
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    )
  `);

  // Create chunks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_count INTEGER,
      FOREIGN KEY (article_id, source_id) REFERENCES articles(id, source_id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_source
    ON chunks(source_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_article
    ON chunks(article_id, source_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_articles_updated
    ON articles(source_id, updated_at)
  `);

  // Create vector table for embeddings
  // This uses sqlite-vec's vec0 virtual table
  // Note: vec0 uses rowid as the implicit primary key
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
      embedding float[768]
    )
  `);
}

/**
 * Drop all tables (for testing or reset)
 */
export function dropSchema(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS chunks_vec');
  db.exec('DROP TABLE IF EXISTS chunks');
  db.exec('DROP TABLE IF EXISTS articles');
  db.exec('DROP TABLE IF EXISTS sources');
}
