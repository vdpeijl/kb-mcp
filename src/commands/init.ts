import { defineCommand } from 'citty';
import { configExists, saveConfig, getDefaultConfig } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { checkOllamaConnection, checkModelAvailable } from '../search/embeddings.js';
import { upsertSource } from '../db/sources.js';
import { testConnection } from '../sync/zendesk.js';
import { exitWithError } from '../utils/errors.js';
import type { Source } from '../config/schema.js';

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Interactive setup wizard',
  },
  async run() {
    try {
      const readline = await import('readline/promises');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log('\n🚀 Welcome to kb-mcp setup!\n');

      // Check if config already exists
      if (configExists()) {
        const overwrite = await rl.question('Configuration already exists. Overwrite? (y/N): ');

        if (overwrite.toLowerCase() !== 'y') {
          console.log('\nSetup cancelled.\n');
          rl.close();
          return;
        }
      }

      // Step 1: Check Ollama
      console.log('\n📋 Step 1: Checking Ollama\n');

      const config = getDefaultConfig();

      const ollamaConnected = await checkOllamaConnection(config.ollama);

      if (!ollamaConnected) {
        console.log(`✗ Cannot connect to Ollama at ${config.ollama.baseUrl}`);
        console.log('\nMake sure Ollama is running:');
        console.log('  ollama serve\n');
        console.log('Install Ollama from: https://ollama.com\n');

        const continueAnyway = await rl.question('Continue anyway? (y/N): ');

        if (continueAnyway.toLowerCase() !== 'y') {
          console.log('\nSetup cancelled.\n');
          rl.close();
          return;
        }
      } else {
        console.log('✓ Ollama is running');

        // Check model
        const modelAvailable = await checkModelAvailable(config.ollama);

        if (!modelAvailable) {
          console.log(`✗ Model '${config.ollama.model}' not found`);
          console.log('\nWould you like to pull it now? This may take a few minutes.');

          const pullModel = await rl.question('Pull model? (Y/n): ');

          if (pullModel.toLowerCase() !== 'n') {
            console.log(`\nPulling ${config.ollama.model}...`);

            const { spawn } = await import('child_process');
            const pull = spawn('ollama', ['pull', config.ollama.model], {
              stdio: 'inherit',
            });

            await new Promise<void>((resolve, reject) => {
              pull.on('close', (code) => {
                if (code === 0) {
                  console.log('\n✓ Model pulled successfully');
                  resolve();
                } else {
                  reject(new Error('Failed to pull model'));
                }
              });
            });
          }
        } else {
          console.log(`✓ Model '${config.ollama.model}' is available`);
        }
      }

      // Step 2: Add first source
      console.log('\n📋 Step 2: Add your first knowledge base\n');

      const addSource = await rl.question('Add a knowledge base now? (Y/n): ');

      let firstSource: Source | null = null;

      if (addSource.toLowerCase() !== 'n') {
        const id = await rl.question('\nSource ID (e.g., "myco"): ');
        const name = await rl.question('Source Name (e.g., "My Company"): ');
        const url = await rl.question('Base URL (e.g., "https://support.myco.com"): ');
        const locale = await rl.question('Locale (e.g., "en-us"): ');

        firstSource = {
          id: id.trim(),
          name: name.trim(),
          baseUrl: url.trim().replace(/\/$/, ''),
          locale: locale.trim(),
          enabled: true,
        };

        // Test connection
        console.log(`\nTesting connection to ${firstSource.baseUrl}...`);

        const connected = await testConnection(firstSource);

        if (!connected) {
          console.log('✗ Cannot connect to this knowledge base');
          console.log('\nMake sure the URL is correct and the Help Center is publicly accessible.');

          const continueAnyway = await rl.question('\nContinue anyway? (y/N): ');

          if (continueAnyway.toLowerCase() !== 'y') {
            firstSource = null;
          }
        } else {
          console.log('✓ Connection successful');
          config.sources.push(firstSource);
        }
      }

      rl.close();

      // Save config
      await saveConfig(config);
      console.log('\n✓ Configuration saved');

      // Initialize database
      await getDatabase();
      console.log('✓ Database initialized');

      // Add source to database
      if (firstSource) {
        const db = await getDatabase();
        upsertSource(db, firstSource);
        console.log('✓ Source added');

        // Ask about syncing
        console.log('\n📋 Step 3: Sync knowledge base\n');
        console.log('You can now sync your knowledge base to make it searchable.');
        console.log('\nRun:');
        console.log('  kb-mcp sync\n');
      }

      // Show next steps
      console.log('\n✅ Setup complete!\n');
      console.log('Next steps:\n');

      if (!firstSource) {
        console.log('  1. Add a knowledge base:');
        console.log('       kb-mcp sources add\n');
        console.log('  2. Sync the knowledge base:');
        console.log('       kb-mcp sync\n');
        console.log('  3. Configure your MCP client:');
        console.log('       kb-mcp setup <client>\n');
      } else {
        console.log('  1. Sync the knowledge base:');
        console.log('       kb-mcp sync\n');
        console.log('  2. Configure your MCP client:');
        console.log('       kb-mcp setup <client>\n');
      }
    } catch (error) {
      exitWithError(error);
    }
  },
});
