/**
 * Base error class for kb-mcp
 */
export class KBMCPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KBMCPError';
  }
}

/**
 * Configuration error
 */
export class ConfigError extends KBMCPError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Database error
 */
export class DatabaseError extends KBMCPError {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Ollama error
 */
export class OllamaError extends KBMCPError {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

/**
 * Zendesk error
 */
export class ZendeskError extends KBMCPError {
  constructor(message: string) {
    super(message);
    this.name = 'ZendeskError';
  }
}

/**
 * Format an error for display to the user
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Exit with an error message
 */
export function exitWithError(error: unknown): never {
  console.error(`\n✗ Error: ${formatError(error)}\n`);
  process.exit(1);
}
