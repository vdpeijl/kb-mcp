import { defineCommand } from 'citty';
import { getDatabase, getDatabaseStats } from '../db/index.js';
import { getSourcesWithStats } from '../db/sources.js';
import { exitWithError } from '../utils/errors.js';

export default defineCommand({
  meta: {
    name: 'stats',
    description: 'Show database statistics',
  },
  async run() {
    try {
      const db = await getDatabase();
      const stats = await getDatabaseStats();
      const sources = getSourcesWithStats(db);

      console.log('\n📊 Database Statistics\n');
      console.log(`Sources: ${stats.sources}`);
      console.log(`Articles: ${stats.articles}`);
      console.log(`Chunks: ${stats.chunks}`);
      console.log(`Database Size: ${formatBytes(stats.databaseSize)}`);

      if (sources.length > 0) {
        console.log('\n📚 Sources:\n');

        for (const source of sources) {
          const status = source.enabled ? '✓' : '✗';
          const lastSynced = source.lastSyncedAt
            ? source.lastSyncedAt.toLocaleString()
            : 'Never';

          console.log(`${status} ${source.name} (${source.id})`);
          console.log(`  Articles: ${source.articleCount}`);
          console.log(`  Chunks: ${source.chunkCount}`);
          console.log(`  Last Synced: ${lastSynced}`);
          console.log();
        }
      }
    } catch (error) {
      exitWithError(error);
    }
  },
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
