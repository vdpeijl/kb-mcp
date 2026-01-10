import debug from 'debug';

/**
 * Create namespaced loggers using the debug package
 */
export const loggers = {
  sync: debug('kb-mcp:sync'),
  embed: debug('kb-mcp:embed'),
  search: debug('kb-mcp:search'),
  mcp: debug('kb-mcp:mcp'),
  db: debug('kb-mcp:db'),
  cli: debug('kb-mcp:cli'),
};

/**
 * Enable all kb-mcp loggers
 */
export function enableAllLoggers() {
  debug.enable('kb-mcp:*');
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return !!process.env.DEBUG;
}
