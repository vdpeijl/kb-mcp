import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { getXDGPaths, ensureDirectories } from './paths.js';
import { ConfigSchema, type Config } from './schema.js';

/**
 * Load configuration from disk
 */
export async function loadConfig(): Promise<Config> {
  const paths = await ensureDirectories();
  const configPath = paths.configFile;

  // Check if config exists
  if (!existsSync(configPath)) {
    throw new Error(
      `Configuration file not found at ${configPath}\n\n` +
      `Run 'kb-mcp init' to create a configuration file.`
    );
  }

  // Read and parse config file
  const configData = await readFile(configPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(configData);
  } catch (error) {
    throw new Error(
      `Invalid JSON in configuration file: ${configPath}\n\n` +
      `Please check the file for syntax errors.`
    );
  }

  // Validate with Zod
  try {
    return ConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map(issue => {
        const path = issue.path.join('.');
        return `  • ${path}: ${issue.message}`;
      }).join('\n');

      throw new Error(
        `Invalid configuration at ${configPath}\n\n${issues}\n\n` +
        `Run 'kb-mcp init' to reconfigure, or edit the file manually.`
      );
    }
    throw error;
  }
}

/**
 * Save configuration to disk
 */
export async function saveConfig(config: Config): Promise<void> {
  const paths = await ensureDirectories();
  const configPath = paths.configFile;

  // Validate before saving
  const validated = ConfigSchema.parse(config);

  // Write to file with pretty formatting
  await writeFile(configPath, JSON.stringify(validated, null, 2), 'utf-8');
}

/**
 * Check if configuration exists
 */
export function configExists(): boolean {
  const paths = getXDGPaths();
  return existsSync(paths.configFile);
}

/**
 * Get a default configuration
 */
export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}
