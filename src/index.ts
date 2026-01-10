#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/index.js';
import { getDatabase } from './db/index.js';
import { getSourcesWithStats } from './db/sources.js';
import { search } from './search/index.js';

/**
 * Create and configure the MCP server
 */
async function createServer() {
  // Load configuration
  const config = await loadConfig();

  // Initialize database
  const db = await getDatabase();

  // Create MCP server
  const server = new Server(
    {
      name: 'kb-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
    return {
      tools: [
        {
          name: 'search_knowledge_base',
          description: 'Search the knowledge base for documentation, guides, and help articles. Returns relevant excerpts with source links.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query',
              },
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by source IDs (optional, searches all if omitted)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 5, max: 20)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'list_sources',
          description: 'List all configured knowledge base sources and their sync status',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'search_knowledge_base') {
        const query = args?.query as string;
        const sources = args?.sources as string[] | undefined;
        const limit = args?.limit as number | undefined;

        if (!query || typeof query !== 'string') {
          throw new Error('Query parameter is required and must be a string');
        }

        const results = await search(db, config, query, { sources, limit });

        // Format results as text
        const formatted = results
          .map((result, i) => {
            const relevancePercent = Math.round(result.relevance * 100);
            return [
              `${i + 1}. **${result.title}**`,
              `   Source: ${result.sourceId}`,
              `   Relevance: ${relevancePercent}%`,
              `   URL: ${result.url}`,
              `   Excerpt: ${result.excerpt}`,
              '',
            ].join('\n');
          })
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: formatted || 'No results found.',
            },
          ],
        };
      }

      if (name === 'list_sources') {
        const sources = getSourcesWithStats(db);

        const formatted = sources
          .map((source) => {
            const lastSynced = source.lastSyncedAt
              ? source.lastSyncedAt.toLocaleString()
              : 'Never';

            return [
              `**${source.name}** (${source.id})`,
              `  Status: ${source.enabled ? 'Enabled' : 'Disabled'}`,
              `  URL: ${source.baseUrl}`,
              `  Locale: ${source.locale}`,
              `  Articles: ${source.articleCount}`,
              `  Chunks: ${source.chunkCount}`,
              `  Last Synced: ${lastSynced}`,
              '',
            ].join('\n');
          })
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: formatted || 'No sources configured.',
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const server = await createServer();

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Server is now running and will handle requests via stdio
    // IMPORTANT: Do not write anything to stdout - it's reserved for MCP protocol
  } catch (error) {
    // Write errors to stderr, not stdout
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createServer };
