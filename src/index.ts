#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config/index.js';
import { getDatabase } from './db/index.js';
import { getSourcesWithStats } from './db/sources.js';
import { search } from './search/index.js';

/**
 * Create and configure the MCP server
 */
async function createServer() {
  const config = await loadConfig();
  const db = await getDatabase();

  const server = new McpServer({
    name: 'kb-mcp',
    version: '0.1.0',
  });

  // Register search tool
  server.registerTool(
    'search_knowledge_base',
    {
      description: 'Search the knowledge base for documentation, guides, and help articles. Returns relevant excerpts with source links.',
      inputSchema: z.object({
        query: z.string().describe('Natural language search query'),
        sources: z.array(z.string()).optional().describe('Filter by source IDs (optional, searches all if omitted)'),
        limit: z.number().optional().describe('Maximum results to return (default: 5, max: 20)'),
      }),
    },
    async ({ query, sources, limit }) => {
      const results = await search(db, config, query, { sources, limit });

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
        content: [{ type: 'text', text: formatted || 'No results found.' }],
      };
    }
  );

  // Register list sources tool
  server.registerTool(
    'list_sources',
    {
      description: 'List all configured knowledge base sources and their sync status',
    },
    async () => {
      const sources = getSourcesWithStats(db);

      const formatted = sources
        .map((source) => {
          const lastSynced = source.lastSyncedAt?.toLocaleString() ?? 'Never';
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
        content: [{ type: 'text', text: formatted || 'No sources configured.' }],
        };
    }
  );

  return server;
}

async function main() {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createServer };
