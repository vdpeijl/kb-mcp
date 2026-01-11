import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';
import { createSchema } from './schema.js';
import { getXDGPaths, ensureDirectories } from '../config/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;

/**
 * Get the path to the sqlite-vec extension for the current platform
 */
function getSqliteVecPath(): string {
  // The extracted file is always named vec0.{dylib|so|dll}
  // Extension is in the native/ directory at the project root
  // Note: better-sqlite3 automatically adds the platform extension (.dylib, .so, .dll)
  return join(__dirname, '..', '..', 'native', 'vec0');
}

/**
 * Initialize and return a database connection
 */
export async function getDatabase(): Promise<Database.Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const paths = await ensureDirectories();
  const dbPath = paths.database;

  // Create database connection
  dbInstance = new Database(dbPath);

  try {
    // Load sqlite-vec extension
    const vecPath = getSqliteVecPath();
    dbInstance.loadExtension(vecPath);

    // Verify the extension loaded
    const versionQuery = dbInstance.prepare('SELECT vec_version() as version');
    const result = versionQuery.get() as { version: string } | undefined;

    if (!result) {
      throw new Error('sqlite-vec extension loaded but version query failed');
    }

    // Create schema if needed
    createSchema(dbInstance);

    return dbInstance;
  } catch (error) {
    // Clean up on error
    dbInstance.close();
    dbInstance = null;

    if (error instanceof Error) {
      if (error.message.includes('cannot open shared object file')) {
        throw new Error(
          `Failed to load sqlite-vec extension.\n\n` +
          `Try reinstalling: npm install -g @vdpeijl/kb-mcp --force\n\n` +
          `Or manually download from:\n` +
          `https://github.com/asg017/sqlite-vec/releases`
        );
      }
      throw error;
    }

    throw new Error('Unknown error initializing database');
  }
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const db = await getDatabase();
  const paths = getXDGPaths();

  const sourcesCount = db.prepare('SELECT COUNT(*) as count FROM sources').get() as { count: number };
  const articlesCount = db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number };
  const chunksCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };

  // Get database file size
  const fs = await import('node:fs/promises');
  const stats = await fs.stat(paths.database);

  return {
    sources: sourcesCount.count,
    articles: articlesCount.count,
    chunks: chunksCount.count,
    databaseSize: stats.size,
  };
}
