import { defineCommand } from 'citty';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../index.js';

export default defineCommand({
  meta: {
    name: 'serve',
    description: 'Start the MCP server (stdio)',
  },
  async run() {
    try {
      const server = await createServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
      // Server is now running and will handle requests via stdio
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      process.exit(1);
    }
  },
});
