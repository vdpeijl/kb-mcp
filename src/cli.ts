#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import { exitWithError } from './utils/errors.js';

const main = defineCommand({
  meta: {
    name: 'kb-mcp',
    version: '0.1.0',
    description: 'MCP server for searching Zendesk knowledge bases',
  },
  subCommands: {
    serve: () => import('./commands/serve.js').then(m => m.default),
    init: () => import('./commands/init.js').then(m => m.default),
    sync: () => import('./commands/sync.js').then(m => m.default),
    sources: () => import('./commands/sources.js').then(m => m.default),
    setup: () => import('./commands/setup.js').then(m => m.default),
    uninstall: () => import('./commands/uninstall.js').then(m => m.default),
    doctor: () => import('./commands/doctor.js').then(m => m.default),
    stats: () => import('./commands/stats.js').then(m => m.default),
  },
});

// Run CLI
runMain(main).catch(exitWithError);
