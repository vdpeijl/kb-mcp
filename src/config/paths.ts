import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

/**
 * Get XDG Base Directory paths or fallback to platform defaults
 */
export function getXDGPaths() {
  const home = homedir();
  const isWindows = platform() === 'win32';

  // Config directory
  const configHome = process.env.XDG_CONFIG_HOME ||
    (isWindows
      ? join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'kb-mcp')
      : join(home, '.config', 'kb-mcp'));

  // Data directory
  const dataHome = process.env.XDG_DATA_HOME ||
    (isWindows
      ? join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'kb-mcp')
      : join(home, '.local', 'share', 'kb-mcp'));

  return {
    config: configHome,
    data: dataHome,
    configFile: join(configHome, 'config.json'),
    database: join(dataHome, 'kb.sqlite'),
    logs: join(dataHome, 'logs'),
  };
}

/**
 * Ensure all necessary directories exist
 */
export async function ensureDirectories() {
  const paths = getXDGPaths();

  await mkdir(paths.config, { recursive: true });
  await mkdir(paths.data, { recursive: true });
  await mkdir(paths.logs, { recursive: true });

  return paths;
}
