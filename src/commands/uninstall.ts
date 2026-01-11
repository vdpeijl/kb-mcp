import { defineCommand } from 'citty';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exitWithError } from '../utils/errors.js';
import { getXDGPaths } from '../config/paths.js';

interface McpServerConfig {
  command: string;
  args?: string[];
}

interface McpServers {
  mcpServers?: Record<string, McpServerConfig>;
}

interface ZedConfig {
  context_servers?: Record<string, { command: { path: string; args: string[] } }>;
}

interface ContinueConfig {
  experimental?: {
    modelContextProtocolServers?: Array<{
      transport: {
        type: string;
        command: string;
        args: string[];
      };
    }>;
  };
}

const CLIENT_CONFIGS = [
  {
    name: 'Claude Code',
    path: join(homedir(), '.claude', 'claude_desktop_config.json'),
    removeEntry: (config: McpServers) => {
      if (config.mcpServers?.['knowledge-base']) {
        delete config.mcpServers['knowledge-base'];
        return true;
      }
      return false;
    },
  },
  {
    name: 'Cursor',
    path: join(homedir(), '.cursor', 'mcp.json'),
    removeEntry: (config: McpServers) => {
      if (config.mcpServers?.['knowledge-base']) {
        delete config.mcpServers['knowledge-base'];
        return true;
      }
      return false;
    },
  },
  {
    name: 'Windsurf',
    path: join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    removeEntry: (config: McpServers) => {
      if (config.mcpServers?.['knowledge-base']) {
        delete config.mcpServers['knowledge-base'];
        return true;
      }
      return false;
    },
  },
  {
    name: 'Zed',
    path: join(homedir(), '.config', 'zed', 'settings.json'),
    removeEntry: (config: ZedConfig) => {
      if (config.context_servers?.['knowledge-base']) {
        delete config.context_servers['knowledge-base'];
        return true;
      }
      return false;
    },
  },
  {
    name: 'Continue.dev',
    path: join(homedir(), '.continue', 'config.json'),
    removeEntry: (config: ContinueConfig) => {
      if (config.experimental?.modelContextProtocolServers) {
        const servers = config.experimental.modelContextProtocolServers;
        const initialLength = servers.length;
        config.experimental.modelContextProtocolServers = servers.filter(
          server => !server.transport.command.includes('kb-mcp')
        );
        return servers.length !== initialLength;
      }
      return false;
    },
  },
];

function removeFromMcpConfigs(): string[] {
  const removed: string[] = [];

  for (const client of CLIENT_CONFIGS) {
    if (!existsSync(client.path)) {
      continue;
    }

    try {
      const content = readFileSync(client.path, 'utf-8');
      const config = JSON.parse(content);

      if (client.removeEntry(config)) {
        writeFileSync(client.path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
        removed.push(client.name);
      }
    } catch (error) {
      console.warn(`⚠ Failed to update ${client.name} config: ${error}`);
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
