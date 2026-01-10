import { defineCommand } from 'citty';
import { getDatabase } from '../db/index.js';
import { checkOllamaConnection, checkModelAvailable } from '../search/embeddings.js';
import { configExists, loadConfig } from '../config/index.js';
import { exitWithError } from '../utils/errors.js';

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check system requirements and configuration',
  },
  async run() {
    try {
      console.log('\n🏥 Running diagnostics...\n');

      let allGood = true;

      // Check Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

      if (majorVersion >= 20) {
        console.log(`✓ Node.js ${nodeVersion} (>= 20.0.0)`);
      } else {
        console.log(`✗ Node.js ${nodeVersion} (requires >= 20.0.0)`);
        allGood = false;
      }

      // Check config exists
      if (configExists()) {
        console.log('✓ Configuration file exists');

        try {
          const config = await loadConfig();
          console.log('✓ Configuration is valid');

          // Check Ollama connection
          const ollamaConnected = await checkOllamaConnection(config.ollama);

          if (ollamaConnected) {
            console.log(`✓ Ollama running at ${config.ollama.baseUrl}`);

            // Check model available
            const modelAvailable = await checkModelAvailable(config.ollama);

            if (modelAvailable) {
              console.log(`✓ Model '${config.ollama.model}' available`);
            } else {
              console.log(`✗ Model '${config.ollama.model}' not found`);
              console.log(`\n  Pull it with:`);
              console.log(`    ollama pull ${config.ollama.model}\n`);
              allGood = false;
            }
          } else {
            console.log(`✗ Cannot connect to Ollama at ${config.ollama.baseUrl}`);
            console.log(`\n  Make sure Ollama is running:`);
            console.log(`    ollama serve\n`);
            allGood = false;
          }
        } catch (error) {
          console.log(`✗ Configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          allGood = false;
        }
      } else {
        console.log('✗ Configuration file not found');
        console.log(`\n  Run 'kb-mcp init' to create configuration\n`);
        allGood = false;
      }

      // Check database
      try {
        const db = await getDatabase();
        console.log('✓ Database accessible');

        // Check sqlite-vec extension
        const versionQuery = db.prepare('SELECT vec_version() as version');
        const result = versionQuery.get() as { version: string };
        console.log(`✓ sqlite-vec extension loaded (v${result.version})`);
      } catch (error) {
        console.log('✗ Database error');
        console.log(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        allGood = false;
      }

      console.log();

      if (allGood) {
        console.log('✅ All checks passed!\n');
        process.exit(0);
      } else {
        console.log('⚠️  Some checks failed. Please fix the issues above.\n');
        process.exit(1);
      }
    } catch (error) {
      exitWithError(error);
    }
  },
});
