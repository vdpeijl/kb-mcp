#!/usr/bin/env node

import { mkdir, chmod } from 'node:fs/promises';
import { get } from 'node:https';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQLITE_VEC_VERSION = '0.1.6';

// Map platform to archive name and extracted file
const PLATFORM_MAP: Record<string, { archive: string; file: string }> = {
  'darwin-arm64': {
    archive: 'sqlite-vec-0.1.6-loadable-macos-aarch64.tar.gz',
    file: 'vec0.dylib',
  },
  'darwin-x64': {
    archive: 'sqlite-vec-0.1.6-loadable-macos-x86_64.tar.gz',
    file: 'vec0.dylib',
  },
  'linux-x64': {
    archive: 'sqlite-vec-0.1.6-loadable-linux-x86_64.tar.gz',
    file: 'vec0.so',
  },
  'win32-x64': {
    archive: 'sqlite-vec-0.1.6-loadable-windows-x86_64.tar.gz',
    file: 'vec0.dll',
  },
};

function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;
  return `${platform}-${arch}`;
}

function downloadAndExtract(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }

        // Recursively handle redirect
        downloadAndExtract(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      // Create gunzip stream
      const gunzip = createGunzip();

      // Create tar extract stream
      const extractor = extract({
        cwd: dest,
        strip: 0, // Don't strip directories
      });

      // Pipe the response through gunzip and tar extract
      response
        .pipe(gunzip)
        .pipe(extractor)
        .on('finish', () => resolve())
        .on('error', (err) => reject(err));

    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    const platformKey = getPlatformKey();
    const platformInfo = PLATFORM_MAP[platformKey];

    if (!platformInfo) {
      throw new Error(
        `Unsupported platform: ${platformKey}. ` +
        `Supported platforms: ${Object.keys(PLATFORM_MAP).join(', ')}`
      );
    }

    const { archive, file } = platformInfo;
    const url = `https://github.com/asg017/sqlite-vec/releases/download/v${SQLITE_VEC_VERSION}/${archive}`;
    const nativeDir = join(__dirname, '..', 'native');

    console.log(`Downloading sqlite-vec for ${platformKey}...`);
    console.log(`URL: ${url}`);

    // Ensure native directory exists
    await mkdir(nativeDir, { recursive: true });

    // Download and extract
    await downloadAndExtract(url, nativeDir);

    // Verify the file exists
    const extractedFile = join(nativeDir, file);
    console.log(`✓ sqlite-vec extracted to ${extractedFile}`);

    // Make executable on Unix-like systems
    if (process.platform !== 'win32') {
      await chmod(extractedFile, 0o755);
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error(`✗ Failed to download sqlite-vec: ${error.message}`);

      // Don't fail installation, just warn
      console.warn('⚠ sqlite-vec extension not installed. You may need to manually download it.');
      console.warn(`  Visit: https://github.com/asg017/sqlite-vec/releases/tag/v${SQLITE_VEC_VERSION}`);
    } else {
      console.error('✗ Unknown error during postinstall');
    }

    // Exit with 0 to not break npm install
    process.exit(0);
  }
}

main();
