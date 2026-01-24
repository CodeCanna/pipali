import path from 'path';
import { getDatabaseDir } from '../paths';

function getDbName() {
    return process.env.POSTGRES_DB || getDatabaseDir();
}

function getBundledPglitePath(filename: string): string | null {
    const serverDir = process.env.PIPALI_SERVER_RESOURCE_DIR;
    if (!serverDir) {
        return null;
    }
    return path.join(serverDir, 'dist', filename);
}

function getPgliteAssetPath(filename: string): string {
    const bundledPath = getBundledPglitePath(filename);
    if (bundledPath) {
        return bundledPath;
    }
    return path.resolve(
        import.meta.dirname,
        '../../../node_modules/@electric-sql/pglite/dist',
        filename
    );
}

async function getPGliteConfig() {
    const wasmPath = getPgliteAssetPath('pglite.wasm');
    const dataPath = getPgliteAssetPath('pglite.data');
    const wasmModule = await WebAssembly.compile(await Bun.file(wasmPath).arrayBuffer());
    const fsBundle = Bun.file(dataPath);

    return {
        wasmModule,
        fsBundle,
    };
}

export { getDbName, getPGliteConfig };

