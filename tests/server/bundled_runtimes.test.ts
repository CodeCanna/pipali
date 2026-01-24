import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    getBundledRuntimes,
    buildBundledRuntimeEnv,
    clearRuntimesCache,
} from '../../src/server/bundled-runtimes';

describe('bundled-runtimes', () => {
    beforeEach(() => {
        clearRuntimesCache();
    });

    afterEach(() => {
        // Clean up environment
        delete process.env.PIPALI_BUNDLED_RUNTIMES_DIR;
        clearRuntimesCache();
    });

    describe('getBundledRuntimes', () => {
        test('returns system commands when no bundled dir is set', async () => {
            delete process.env.PIPALI_BUNDLED_RUNTIMES_DIR;

            const runtimes = await getBundledRuntimes();

            expect(runtimes.isBundled).toBe(false);
            expect(runtimes.bun).toBe('bun');
            expect(runtimes.uv).toBe('uv');
            expect(runtimes.uvx).toBe('uvx');
        });

        test('returns system commands when bundled dir does not contain binaries', async () => {
            process.env.PIPALI_BUNDLED_RUNTIMES_DIR = '/nonexistent/path';

            const runtimes = await getBundledRuntimes();

            expect(runtimes.isBundled).toBe(false);
            expect(runtimes.bun).toBe('bun');
            expect(runtimes.uv).toBe('uv');
            expect(runtimes.uvx).toBe('uvx');
        });

        test('caches the result', async () => {
            const runtimes1 = await getBundledRuntimes();
            const runtimes2 = await getBundledRuntimes();

            expect(runtimes1).toBe(runtimes2);
        });
    });

    describe('buildBundledRuntimeEnv', () => {
        test('returns the original env when no bundled runtimes', async () => {
            delete process.env.PIPALI_BUNDLED_RUNTIMES_DIR;

            const baseEnv = { PATH: '/usr/bin' };
            const env = await buildBundledRuntimeEnv(baseEnv);

            expect(env).toBe(baseEnv);
        });

        test('prepends the bundled runtimes directory to PATH', async () => {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipali-runtimes-'));
            const bunPath = path.join(tempDir, process.platform === 'win32' ? 'bun.exe' : 'bun');
            const uvPath = path.join(tempDir, process.platform === 'win32' ? 'uv.exe' : 'uv');
            const uvxPath = path.join(tempDir, process.platform === 'win32' ? 'uvx.exe' : 'uvx');

            await fs.writeFile(bunPath, '');
            await fs.writeFile(uvPath, '');
            await fs.writeFile(uvxPath, '');

            if (process.platform !== 'win32') {
                await fs.chmod(bunPath, 0o755);
                await fs.chmod(uvPath, 0o755);
                await fs.chmod(uvxPath, 0o755);
            }

            process.env.PIPALI_BUNDLED_RUNTIMES_DIR = tempDir;

            const baseEnv = { PATH: '/usr/bin' };
            const env = await buildBundledRuntimeEnv(baseEnv);

            const expectedPrefix = `${tempDir}${path.delimiter}`;
            expect(env.PATH?.startsWith(expectedPrefix)).toBe(true);
        });
    });
});
