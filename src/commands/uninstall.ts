import { defineCommand } from 'citty';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { exitWithError } from '../utils/errors.js';
import { getXDGPaths } from '../config/paths.js';

/**
 * Client configuration interface
 *
 * To add a new client, create a new entry in CLIENT_CONFIGS array below
 */
interface ClientConfig {
  /** Display name */
  name: string;
  /** Remove function that removes kb-mcp from the client config */
  remove: () => boolean;
}

/**
 * Helper function to remove kb-mcp from JSON-based MCP clients
 * Reads config, removes the entry, and writes back
 */
function removeFromJsonClient(
  configPath: string,
  clientName: string,
  remover: (config: any) => boolean
): boolean {
  if (!existsSync(configPath)) {
    return false;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (remover(config)) {
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`⚠ Failed to update ${clientName} config: ${error}`);
    return false;
  }
}

/**
 * MCP Client configurations
 *
 * To add support for a new client:
 * 1. Add a new entry to this array
 * 2. Implement the remove() function that returns true if kb-mcp was removed
 * 3. For CLI-based clients, use execSync()
 * 4. For file-based clients, use removeFromJsonClient() helper
 */
const CLIENT_CONFIGS: ClientConfig[] = [
  {
    name: 'Claude Code',
    remove: () => {
      try {
        execSync('claude mcp remove knowledge-base', { stdio: 'pipe' });
        return true;
      } catch (error: any) {
        // Silently skip if CLI not found or server not installed
        if (!error.message?.includes('command not found') && !error.message?.includes('not found')) {
          console.warn(`⚠ Failed to remove from Claude Code via CLI: ${error.message}`);
        }
        return false;
      }
    },
  },
  // Example: How to add a file-based client (commented out)
  // {
  //   name: 'Cursor',
  //   remove: () => {
  //     return removeFromJsonClient(
  //       join(homedir(), '.cursor', 'mcp.json'),
  //       'Cursor',
  //       (config) => {
  //         if (config.mcpServers?.['knowledge-base']) {
  //           delete config.mcpServers['knowledge-base'];
  //           return true;
  //         }
  //         return false;
  //       }
  //     );
  //   },
  // },
];

function removeFromMcpConfigs(): string[] {
  const removed: string[] = [];

  for (const client of CLIENT_CONFIGS) {
    if (client.remove()) {
      removed.push(client.name);
    }
  }

  return removed;
}

export default defineCommand({
  meta: {
    name: 'uninstall',
    description: 'Remove kb-mcp data and MCP server configurations',
  },
  args: {
    'keep-data': {
      type: 'boolean',
      description: 'Keep database and config files, only remove from MCP clients',
      default: false,
    },
  },
  async run({ args }) {
    try {
      console.log('\n🗑️  Uninstalling kb-mcp...\n');

      const keepData = args['keep-data'] as boolean;
      const removed: string[] = [];

      // Remove from MCP client configs
      console.log('Removing from MCP client configurations...');
      const removedClients = removeFromMcpConfigs();

      if (removedClients.length > 0) {
        console.log(`✓ Removed from: ${removedClients.join(', ')}`);
        removed.push(...removedClients);
      } else {
        console.log('  No MCP configurations found');
      }

      if (!keepData) {
        const paths = getXDGPaths();

        // Remove data directory
        if (existsSync(paths.data)) {
          rmSync(paths.data, { recursive: true, force: true });
          console.log(`✓ Removed data directory: ${paths.data}`);
          removed.push('data files');
        }

        // Remove config directory
        if (existsSync(paths.config)) {
          rmSync(paths.config, { recursive: true, force: true });
          console.log(`✓ Removed config directory: ${paths.config}`);
          removed.push('config file');
        }
      }

      console.log();

      if (removed.length > 0) {
        console.log('✅ kb-mcp has been uninstalled');
        console.log();
        console.log('To completely remove the package, run:');
        console.log('  npm uninstall -g @vdpeijl/kb-mcp');
        console.log();
      } else {
        console.log('ℹ️  No kb-mcp installations found');
        console.log();
      }
    } catch (error) {
      exitWithError(error);
    }
  },
});
