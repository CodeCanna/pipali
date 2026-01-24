const maxIterations = parseInt(process.env.PIPALI_RESEARCH_ITERATIONS || '100', 10);

function getDefaultUser() {
    if (process.env.PIPALI_ADMIN_EMAIL && process.env.PIPALI_ADMIN_PASSWORD) {
        return {
            email: process.env.PIPALI_ADMIN_EMAIL,
            password: process.env.PIPALI_ADMIN_PASSWORD,
        };
    }
    return {
        email: 'admin@localhost',
        password: 'admin',
    };
}

function getMigrationsFolder(): string {
    // In Tauri desktop app mode (detected by PIPALI_BUNDLED_RUNTIMES_DIR),
    // the server is bundled at resources/server/dist/index.js
    // and drizzle migrations are at resources/server/drizzle/
    // So we need ../drizzle relative to the bundled script location.
    // In development mode, it's relative to the current working directory.
    if (process.env.PIPALI_BUNDLED_RUNTIMES_DIR) {
        // Running in Tauri app - bundled at dist/index.js, drizzle at ../drizzle
        return `${import.meta.dirname}/../drizzle`;
    }
    return `${process.cwd()}/drizzle`;
}

export { getDefaultUser, getMigrationsFolder, maxIterations };