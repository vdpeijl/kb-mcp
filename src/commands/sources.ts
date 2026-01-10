import { defineCommand } from 'citty';
import { loadConfig, saveConfig } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { upsertSource, deleteSource, setSourceEnabled, getSourcesWithStats } from '../db/sources.js';
import { testConnection } from '../sync/zendesk.js';
import { exitWithError } from '../utils/errors.js';
import type { Source } from '../config/schema.js';

export default defineCommand({
  meta: {
    name: 'sources',
    description: 'Manage knowledge base sources',
  },
  subCommands: {
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List all sources',
      },
      async run() {
        try {
          const db = await getDatabase();
          const sources = getSourcesWithStats(db);

          if (sources.length === 0) {
            console.log('\nNo sources configured yet.\n');
            console.log('Add one with:');
            console.log('  kb-mcp sources add\n');
            return;
          }

          console.log('\n📚 Knowledge Base Sources\n');

          for (const source of sources) {
            const status = source.enabled ? '✓' : '✗';
            const lastSynced = source.lastSyncedAt
              ? source.lastSyncedAt.toLocaleString()
              : 'Never';

            console.log(`${status} ${source.name} (${source.id})`);
            console.log(`  URL: ${source.baseUrl}`);
            console.log(`  Locale: ${source.locale}`);
            console.log(`  Articles: ${source.articleCount}`);
            console.log(`  Chunks: ${source.chunkCount}`);
            console.log(`  Last Synced: ${lastSynced}`);
            console.log();
          }
        } catch (error) {
          exitWithError(error);
        }
      },
    }),

    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Add a new source',
      },
      args: {
        id: {
          type: 'string',
          description: 'Source ID',
        },
        name: {
          type: 'string',
          description: 'Source name',
        },
        url: {
          type: 'string',
          description: 'Zendesk Help Center base URL',
        },
        locale: {
          type: 'string',
          description: 'Locale (e.g., en-us, nl)',
        },
      },
      async run({ args }) {
        try {
          const config = await loadConfig();
          const db = await getDatabase();

          // Interactive mode if no args provided
          if (!args.id || !args.name || !args.url || !args.locale) {
            const readline = await import('readline/promises');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            console.log('\n📝 Add Knowledge Base Source\n');

            const id = (args.id as string) || await rl.question('Source ID (e.g., "myco"): ');
            const name = (args.name as string) || await rl.question('Source Name (e.g., "My Company"): ');
            const url = (args.url as string) || await rl.question('Base URL (e.g., "https://support.myco.com"): ');
            const locale = (args.locale as string) || await rl.question('Locale (e.g., "en-us"): ');

            rl.close();

            const source: Source = {
              id: String(id).trim(),
              name: String(name).trim(),
              baseUrl: String(url).trim().replace(/\/$/, ''),
              locale: String(locale).trim(),
              enabled: true,
            };

            await addSource(config, db, source);
          } else {
            const source: Source = {
              id: String(args.id),
              name: String(args.name),
              baseUrl: String(args.url).replace(/\/$/, ''),
              locale: String(args.locale),
              enabled: true,
            };

            await addSource(config, db, source);
          }
        } catch (error) {
          exitWithError(error);
        }
      },
    }),

    remove: defineCommand({
      meta: {
        name: 'remove',
        description: 'Remove a source',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Source ID to remove',
          required: true,
        },
      },
      async run({ args }) {
        try {
          const config = await loadConfig();
          const db = await getDatabase();
          const id = args.id as string;

          // Remove from database
          deleteSource(db, id);

          // Remove from config
          config.sources = config.sources.filter(s => s.id !== id);
          await saveConfig(config);

          console.log(`\n✓ Removed source: ${id}\n`);
        } catch (error) {
          exitWithError(error);
        }
      },
    }),

    enable: defineCommand({
      meta: {
        name: 'enable',
        description: 'Enable a source',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Source ID to enable',
          required: true,
        },
      },
      async run({ args }) {
        try {
          const config = await loadConfig();
          const db = await getDatabase();
          const id = args.id as string;

          // Update database
          setSourceEnabled(db, id, true);

          // Update config
          const source = config.sources.find(s => s.id === id);
          if (source) {
            source.enabled = true;
            await saveConfig(config);
          }

          console.log(`\n✓ Enabled source: ${id}\n`);
        } catch (error) {
          exitWithError(error);
        }
      },
    }),

    disable: defineCommand({
      meta: {
        name: 'disable',
        description: 'Disable a source',
      },
      args: {
        id: {
          type: 'positional',
          description: 'Source ID to disable',
          required: true,
        },
      },
      async run({ args }) {
        try {
          const config = await loadConfig();
          const db = await getDatabase();
          const id = args.id as string;

          // Update database
          setSourceEnabled(db, id, false);

          // Update config
          const source = config.sources.find(s => s.id === id);
          if (source) {
            source.enabled = false;
            await saveConfig(config);
          }

          console.log(`\n✓ Disabled source: ${id}\n`);
        } catch (error) {
          exitWithError(error);
        }
      },
    }),
  },

  async run() {
    // Default: list sources
    const db = await getDatabase();
    const sources = getSourcesWithStats(db);

    if (sources.length === 0) {
      console.log('\nNo sources configured yet.\n');
      console.log('Add one with:');
      console.log('  kb-mcp sources add\n');
      return;
    }

    console.log('\n📚 Knowledge Base Sources\n');

    for (const source of sources) {
      const status = source.enabled ? '✓' : '✗';
      const lastSynced = source.lastSyncedAt
        ? source.lastSyncedAt.toLocaleString()
        : 'Never';

      console.log(`${status} ${source.name} (${source.id})`);
      console.log(`  URL: ${source.baseUrl}`);
      console.log(`  Locale: ${source.locale}`);
      console.log(`  Articles: ${source.articleCount}`);
      console.log(`  Chunks: ${source.chunkCount}`);
      console.log(`  Last Synced: ${lastSynced}`);
      console.log();
    }
  },
});

async function addSource(config: any, db: any, source: Source) {
  // Validate
  if (!source.id || !source.name || !source.baseUrl || !source.locale) {
    throw new Error('All fields are required');
  }

  // Check if source already exists
  if (config.sources.some((s: Source) => s.id === source.id)) {
    throw new Error(`Source with ID '${source.id}' already exists`);
  }

  // Test connection
  console.log(`\nTesting connection to ${source.baseUrl}...`);

  const connected = await testConnection(source);

  if (!connected) {
    throw new Error(
      `Cannot connect to ${source.baseUrl}\n\n` +
      `Make sure the URL is correct and the Help Center is publicly accessible.`
    );
  }

  console.log('✓ Connection successful');

  // Add to database
  upsertSource(db, source);

  // Add to config
  config.sources.push(source);
  await saveConfig(config);

  console.log(`\n✓ Added source: ${source.name} (${source.id})`);
  console.log(`\nRun 'kb-mcp sync' to index this knowledge base.\n`);
}
