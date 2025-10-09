function getDefaultUser() {
    if (process.env.PANINI_ADMIN_EMAIL && process.env.PANINI_ADMIN_PASSWORD) {
        return {
            email: process.env.PANINI_ADMIN_EMAIL,
            password: process.env.PANINI_ADMIN_PASSWORD,
        };
    }
    return {
        email: 'admin@localhost',
        password: 'admin',
    };
}

function getDbName() {
    const defaultDbPath = `${process.cwd()}/panini.db`;
    return process.env.POSTGRES_DB || defaultDbPath;
}

// Import PGlite WASM files to embed in binary
import wasmFile from '../../node_modules/@electric-sql/pglite/dist/pglite.wasm' with { type: 'file' };
import dataFile from '../../node_modules/@electric-sql/pglite/dist/pglite.data' with { type: 'file' };

async function getPGliteConfig() {
    const wasmModule = await WebAssembly.compile(await Bun.file(wasmFile).arrayBuffer());
    const fsBundle = Bun.file(dataFile);

    return {
        wasmModule,
        fsBundle,
    };
}

function getMigrationsFolder() {
    return `${process.cwd()}/drizzle`;
}

export { getDefaultUser, getDbName, getPGliteConfig, getMigrationsFolder };