import { defineCommand } from 'citty';
import { exitWithError } from '../utils/errors.js';

const CONFIGS = {
  'claude-code': {
    name: 'Claude Code',
    path: '~/.claude/claude_desktop_config.json',
    config: {
      mcpServers: {
        'knowledge-base': {
          command: 'kb-mcp',
          args: ['serve'],
        },
      },
    },
  },
  cursor: {
    name: 'Cursor',
    path: 'Settings → Features → MCP Servers',
    config: {
      mcpServers: {
        'knowledge-base': {
          command: 'kb-mcp',
          args: ['serve'],
        },
      },
    },
  },
  windsurf: {
    name: 'Windsurf',
    path: '~/.codeium/windsurf/mcp_config.json',
    config: {
      mcpServers: {
        'knowledge-base': {
          command: 'kb-mcp',
          args: ['serve'],
        },
      },
    },
  },
  continue: {
    name: 'Continue.dev',
    path: '~/.continue/config.json',
    config: {
      experimental: {
        modelContextProtocolServers: [
          {
            transport: {
              type: 'stdio',
              command: 'kb-mcp',
              args: ['serve'],
            },
          },
        ],
      },
    },
  },
  zed: {
    name: 'Zed',
    path: '~/.config/zed/settings.json',
    config: {
      context_servers: {
        'knowledge-base': {
          command: {
            path: 'kb-mcp',
            args: ['serve'],
          },
        },
      },
    },
  },
};

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Print MCP client configuration',
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
        console.log('Run with a client name to see specific configuration:\n');

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

      console.log(`\n🔧 ${config.name} Configuration\n`);
      console.log(`Add this to ${config.path}:\n`);
      console.log('```json');
      console.log(JSON.stringify(config.config, null, 2));
      console.log('```\n');
    } catch (error) {
      exitWithError(error);
    }
  },
});
