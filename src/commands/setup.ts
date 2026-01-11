import { defineCommand } from 'citty';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { exitWithError } from '../utils/errors.js';

/**
 * Client configuration interface
 *
 * To add a new client, create a new entry in CLIENT_CONFIGS array below
 */
interface ClientConfig {
  /** Client key (used in CLI: kb-mcp setup <key>) */
  key: string;
  /** Display name */
  name: string;
  /** Setup function that configures the client */
  setup: () => Promise<void>;
}

/**
 * Helper function to setup JSON-based MCP clients
 * Reads existing config, merges the kb-mcp server entry, and writes back
 */
async function setupJsonClient(
  configPath: string,
  clientName: string,
  merger: (existing: any) => any
): Promise<void> {
  // Ensure directory exists
  mkdirSync(dirname(configPath), { recursive: true });

  // Read existing config or create new
  let config: any = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${configPath}, creating new config`);
    }
  }

  // Merge configuration
  config = merger(config);

  // Write back
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`✅ Successfully configured ${clientName} at ${configPath}`);
}

/**
 * MCP Client configurations
 *
 * To add support for a new client:
 * 1. Add a new entry to this array
 * 2. Implement the setup() function
 * 3. For CLI-based clients, use execSync()
 * 4. For file-based clients, use setupJsonClient() helper
 */
const CLIENT_CONFIGS: ClientConfig[] = [
  {
    key: 'claude-code',
    name: 'Claude Code',
    setup: async () => {
      const cmd = 'claude mcp add --transport stdio knowledge-base -- bash -l -c "kb-mcp serve"';
      try {
        execSync(cmd, { stdio: 'inherit' });
        console.log('✅ Successfully configured Claude Code');
      } catch (error: any) {
        if (error.message?.includes('command not found')) {
          throw new Error('Claude Code CLI not found. Please install it first:\n  npm install -g @anthropic/claude-code');
        }
        throw error;
      }
    },
  },
  // Example: How to add a file-based client (commented out)
  // {
  //   key: 'cursor',
  //   name: 'Cursor',
  //   setup: async () => {
  //     await setupJsonClient(
  //       join(homedir(), '.cursor', 'mcp.json'),
  //       'Cursor',
  //       (existing) => {
  //         if (!existing.mcpServers) {
  //           existing.mcpServers = {};
  //         }
  //         existing.mcpServers['knowledge-base'] = {
  //           command: 'bash',
  //           args: ['-l', '-c', 'kb-mcp serve'],
  //         };
  //         return existing;
  //       }
  //     );
  //   },
  // },
];

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Automatically configure MCP client',
  },
  args: {
    client: {
      type: 'positional',
      description: `MCP client (${CLIENT_CONFIGS.map(c => c.key).join(', ')})`,
      required: false,
    },
  },
  async run({ args }) {
    try {
      const clientKey = args.client as string | undefined;

      if (!clientKey) {
        // Show all options
        console.log('\n🔧 MCP Client Setup\n');
        console.log('Run with a client name to automatically configure:\n');

        for (const client of CLIENT_CONFIGS) {
          console.log(`  kb-mcp setup ${client.key.padEnd(15)} # ${client.name}`);
        }

        console.log();
        return;
      }

      const config = CLIENT_CONFIGS.find(c => c.key === clientKey);

      if (!config) {
        console.error(`\n✗ Unknown client: ${clientKey}\n`);
        console.error('Available clients:', CLIENT_CONFIGS.map(c => c.key).join(', '));
        console.error();
        process.exit(1);
      }

      console.log(`\n🔧 Configuring ${config.name}...\n`);

      await config.setup();

      console.log();
      console.log('Next steps:');
      console.log('  1. Restart your MCP client');
      console.log('  2. The knowledge-base MCP server should now be available');
      console.log();
    } catch (error) {
      exitWithError(error);
    }
  },
});
