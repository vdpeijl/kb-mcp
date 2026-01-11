import { defineCommand } from 'citty';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { exitWithError } from '../utils/errors.js';

interface ClientConfig {
  name: string;
  path: string;
  cliCommand?: string;
  setup: () => Promise<void>;
}

async function setupClaudeCode() {
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
}

async function setupJsonClient(configPath: string, clientName: string, merger: (existing: any) => any) {
  const fullPath = configPath.startsWith('~')
    ? join(homedir(), configPath.slice(2))
    : configPath;

  // Ensure directory exists
  mkdirSync(dirname(fullPath), { recursive: true });

  // Read existing config or create new
  let config: any = {};
  if (existsSync(fullPath)) {
    try {
      const content = readFileSync(fullPath, 'utf-8');
      config = JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${fullPath}, creating new config`);
    }
  }

  // Merge configuration
  config = merger(config);

  // Write back
  writeFileSync(fullPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`✅ Successfully configured ${clientName} at ${fullPath}`);
}

const CONFIGS: Record<string, ClientConfig> = {
  'claude-code': {
    name: 'Claude Code',
    path: '~/.claude/claude_desktop_config.json',
    cliCommand: 'claude mcp add --transport stdio knowledge-base -- bash -l -c "kb-mcp serve"',
    setup: setupClaudeCode,
  },
  cursor: {
    name: 'Cursor',
    path: join(homedir(), '.cursor', 'mcp.json'),
    setup: async () => {
      await setupJsonClient(
        join(homedir(), '.cursor', 'mcp.json'),
        'Cursor',
        (existing) => {
          if (!existing.mcpServers) {
            existing.mcpServers = {};
          }
          existing.mcpServers['knowledge-base'] = {
            command: 'bash',
            args: ['-l', '-c', 'kb-mcp serve'],
          };
          return existing;
        }
      );
    },
  },
  windsurf: {
    name: 'Windsurf',
    path: '~/.codeium/windsurf/mcp_config.json',
    setup: async () => {
      await setupJsonClient(
        join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
        'Windsurf',
        (existing) => {
          if (!existing.mcpServers) {
            existing.mcpServers = {};
          }
          existing.mcpServers['knowledge-base'] = {
            command: 'bash',
            args: ['-l', '-c', 'kb-mcp serve'],
          };
          return existing;
        }
      );
    },
  },
  continue: {
    name: 'Continue.dev',
    path: '~/.continue/config.json',
    setup: async () => {
      await setupJsonClient(
        join(homedir(), '.continue', 'config.json'),
        'Continue.dev',
        (existing) => {
          if (!existing.experimental) {
            existing.experimental = {};
          }
          if (!existing.experimental.modelContextProtocolServers) {
            existing.experimental.modelContextProtocolServers = [];
          }

          // Check if kb-mcp already exists
          const servers = existing.experimental.modelContextProtocolServers;
          const hasKbMcp = servers.some((s: any) =>
            s.transport?.command?.includes('kb-mcp')
          );

          if (!hasKbMcp) {
            servers.push({
              transport: {
                type: 'stdio',
                command: 'bash',
                args: ['-l', '-c', 'kb-mcp serve'],
              },
            });
          }

          return existing;
        }
      );
    },
  },
  zed: {
    name: 'Zed',
    path: '~/.config/zed/settings.json',
    setup: async () => {
      await setupJsonClient(
        join(homedir(), '.config', 'zed', 'settings.json'),
        'Zed',
        (existing) => {
          if (!existing.context_servers) {
            existing.context_servers = {};
          }
          existing.context_servers['knowledge-base'] = {
            command: {
              path: 'bash',
              args: ['-l', '-c', 'kb-mcp serve'],
            },
          };
          return existing;
        }
      );
    },
  },
};

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Automatically configure MCP client',
  },
  args: {
    client: {
      type: 'positional',
      description: 'MCP client (claude-code, cursor, windsurf, continue, zed)',
      required: false,
    },
  },
  async run({ args }) {
    try {
      const client = args.client as string | undefined;

      if (!client) {
        // Show all options
        console.log('\n🔧 MCP Client Setup\n');
        console.log('Run with a client name to automatically configure:\n');

        for (const [key, value] of Object.entries(CONFIGS)) {
          console.log(`  kb-mcp setup ${key.padEnd(15)} # ${value.name}`);
        }

        console.log();
        return;
      }

      const config = CONFIGS[client as keyof typeof CONFIGS];

      if (!config) {
        console.error(`\n✗ Unknown client: ${client}\n`);
        console.error('Available clients:', Object.keys(CONFIGS).join(', '));
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
