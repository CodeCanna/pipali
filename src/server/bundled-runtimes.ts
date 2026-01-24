/**
 * Bundled Runtimes Utility
 *
 * Provides paths to bundled Bun and UV runtimes when running in the desktop app.
 * Falls back to system-installed versions when running in development or CLI mode.
 *
 * The desktop app bundles:
 * - Bun: For running TypeScript/JavaScript (used by docx_create.ts)
 * - UV/UVX: For running Python scripts with auto-installed dependencies
 *
 * This enables a "just works" experience for non-technical users without
 * requiring manual installation of Bun, UV, or Python.
 */

import path from 'path';
import fs from 'fs/promises';
import { createChildLogger } from './logger';

const log = createChildLogger({ component: 'bundled-runtimes' });

/**
 * Runtime paths for bundled executables
 */
export interface BundledRuntimes {
    /** Path to bundled Bun executable, or 'bun' if using system version */
    bun: string;
    /** Path to bundled UV executable, or 'uv' if using system version */
    uv: string;
    /** Path to bundled UVX executable, or 'uvx' if using system version */
    uvx: string;
    /** Whether bundled runtimes are available */
    isBundled: boolean;
}

/** Cached runtime paths */
let cachedRuntimes: BundledRuntimes | null = null;

type BundledDirSource = 'env' | 'exec';

/**
 * Get the directory containing bundled runtime binaries.
 *
 * In the Tauri desktop app, this is set via PIPALI_BUNDLED_RUNTIMES_DIR
 * environment variable by the Rust sidecar launcher.
 * As a fallback, derive it from the current process executable (bun)
 * and use its directory.
 */
function getBundledRuntimesDir(): { dir: string; source: BundledDirSource } | null {
    if (process.env.PIPALI_BUNDLED_RUNTIMES_DIR) {
        return { dir: process.env.PIPALI_BUNDLED_RUNTIMES_DIR, source: 'env' };
    }

    const execPath = process.execPath;
    const execBase = path.basename(execPath).toLowerCase();
    if (execBase === 'bun' || execBase === 'bun.exe') {
        return { dir: path.dirname(execPath), source: 'exec' };
    }

    return null;
}

/**
 * Detect the current platform's binary extension
 */
function getBinaryExtension(): string {
    return process.platform === 'win32' ? '.exe' : '';
}

/**
 * Check if a file exists and is executable
 */
async function isExecutable(filePath: string): Promise<boolean> {
    try {
        if (process.platform === 'win32') {
            await fs.access(filePath, fs.constants.F_OK);
        } else {
            await fs.access(filePath, fs.constants.X_OK);
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Get paths to bundled runtimes.
 *
 * When running in the desktop app with bundled runtimes:
 * - Returns absolute paths to the bundled Bun, UV, and UVX binaries
 *
 * When running in development or without bundled runtimes:
 * - Returns simple command names ('bun', 'uv', 'uvx') that rely on PATH
 *
 * Results are cached for performance.
 *
 * @example
 * ```ts
 * const runtimes = await getBundledRuntimes();
 *
 * // Use bundled Bun to run a script
 * const proc = Bun.spawn([runtimes.bun, 'run', 'script.ts']);
 *
 * // Use bundled uvx to run Python with dependencies
 * const proc = Bun.spawn([runtimes.uvx, '--with', 'openpyxl', 'python', 'script.py']);
 * ```
 */
export async function getBundledRuntimes(): Promise<BundledRuntimes> {
    // Return cached result if available
    if (cachedRuntimes) {
        return cachedRuntimes;
    }

    const bundledDirInfo = getBundledRuntimesDir();
    const ext = getBinaryExtension();

    // Check if we have bundled runtimes
    if (bundledDirInfo) {
        const bundledDir = bundledDirInfo.dir;
        const bunPath = path.join(bundledDir, `bun${ext}`);
        const uvPath = path.join(bundledDir, `uv${ext}`);
        const uvxPath = path.join(bundledDir, `uvx${ext}`);

        // Verify the binaries exist
        const [bunExists, uvExists, uvxExists] = await Promise.all([
            isExecutable(bunPath),
            isExecutable(uvPath),
            isExecutable(uvxPath),
        ]);

        if (bunExists && uvExists && uvxExists) {
            log.info(`Using bundled runtimes from ${bundledDir}`);
            cachedRuntimes = {
                bun: bunPath,
                uv: uvPath,
                uvx: uvxPath,
                isBundled: true,
            };
            return cachedRuntimes;
        }

        // Some binaries missing - log warning and fall back to system
        if (bundledDirInfo.source === 'env') {
            const missing = [];
            if (!bunExists) missing.push('bun');
            if (!uvExists) missing.push('uv');
            if (!uvxExists) missing.push('uvx');
            log.warn(`Bundled runtimes directory set but missing: ${missing.join(', ')}`);
        }
    }

    // Fall back to system-installed versions
    log.debug('Using system-installed runtimes (bun, uv, uvx)');
    cachedRuntimes = {
        bun: 'bun',
        uv: 'uv',
        uvx: 'uvx',
        isBundled: false,
    };
    return cachedRuntimes;
}

/**
 * Build an environment with bundled runtimes prepended to PATH when available.
 * Returns the original environment when not bundled.
 */
export async function buildBundledRuntimeEnv(
    baseEnv: NodeJS.ProcessEnv = process.env
): Promise<NodeJS.ProcessEnv> {
    const runtimes = await getBundledRuntimes();

    if (!runtimes.isBundled) {
        return baseEnv;
    }

    const bunDir = path.dirname(runtimes.bun);
    const delimiter = path.delimiter;
    const currentPath = baseEnv.PATH ?? baseEnv.Path ?? '';
    const nextPath = currentPath ? `${bunDir}${delimiter}${currentPath}` : bunDir;

    const env: NodeJS.ProcessEnv = { ...baseEnv, PATH: nextPath };
    if (process.platform === 'win32') {
        env.Path = nextPath;
    }

    log.debug(`Prepended bundled runtimes to PATH`);
    return env;
}

/**
 * Clear the cached runtime paths.
 * Useful for testing or if the runtime environment changes.
 */
export function clearRuntimesCache(): void {
    cachedRuntimes = null;
}
