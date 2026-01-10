import { defineCommand } from 'citty';
import { loadConfig } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { getEnabledSources, getSource } from '../db/sources.js';
import { syncSource } from '../sync/index.js';
import { exitWithError } from '../utils/errors.js';
import type { SyncProgress } from '../sync/index.js';

export default defineCommand({
  meta: {
    name: 'sync',
    description: 'Sync knowledge bases',
  },
  args: {
    source: {
      type: 'string',
      description: 'Sync specific source only',
    },
    full: {
      type: 'boolean',
      description: 'Full re-sync (re-embed everything)',
      default: false,
    },
  },
  async run({ args }) {
    try {
      const config = await loadConfig();
      const db = await getDatabase();

      // Sync sources from config to database
      const { upsertSource } = await import('../db/sources.js');
      for (const source of config.sources) {
        upsertSource(db, source);
      }

      let sources;

      if (args.source) {
        const source = getSource(db, args.source as string);

        if (!source) {
          console.error(`\n✗ Source not found: ${args.source}\n`);
          process.exit(1);
        }

        sources = [source];
      } else {
        sources = getEnabledSources(db);

        if (sources.length === 0) {
          console.log('\nNo enabled sources to sync.\n');
          console.log('Add a source with:');
          console.log('  kb-mcp sources add\n');
          return;
        }
      }

      const fullResync = args.full === true;

      if (fullResync) {
        console.log('\n🔄 Running full re-sync (all articles will be re-processed)\n');
      } else {
        console.log('\n🔄 Running incremental sync\n');
      }

      for (const source of sources) {
        console.log(`\n📚 Syncing: ${source.name}`);
        console.log('─'.repeat(50));

        const startTime = Date.now();
        let lastMessage = '';

        const result = await syncSource(
          db,
          source,
          config,
          (progress: SyncProgress) => {
            const message = formatProgress(progress);

            if (message !== lastMessage) {
              // Clear previous line
              if (lastMessage) {
                process.stdout.write('\r\x1b[K');
              }

              process.stdout.write(message);
              lastMessage = message;
            }
          },
          fullResync
        );

        // Clear progress line
        if (lastMessage) {
          process.stdout.write('\r\x1b[K');
        }

        const duration = (result.timeElapsed / 1000).toFixed(1);

        console.log(`✓ Sync complete in ${duration}s`);
        console.log(`  Articles fetched: ${result.articlesFetched}`);
        console.log(`  Articles processed: ${result.articlesProcessed}`);
        console.log(`  Chunks created: ${result.chunksCreated}`);
      }

      console.log('\n✅ Sync completed successfully\n');
    } catch (error) {
      exitWithError(error);
    }
  },
});

function formatProgress(progress: SyncProgress): string {
  const { phase, current, total, message } = progress;

  const phaseEmojis: Record<typeof phase, string> = {
    fetching: '📥',
    parsing: '📝',
    chunking: '✂️',
    embedding: '🔢',
    storing: '💾',
  };

  const emoji = phaseEmojis[phase];
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  if (total > 0 && current > 0) {
    return `${emoji} ${message} (${percent}%)`;
  }

  return `${emoji} ${message}`;
}
