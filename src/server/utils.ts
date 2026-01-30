import path from 'path';

const maxIterations = parseInt(process.env.PIPALI_RESEARCH_ITERATIONS || '100', 10);

function getDefaultUser() {
    return {
        email: 'admin@localhost',
    };
}

function getMigrationsFolder(): string {
    // In Tauri desktop app mode, the server resources directory is provided
    // so we can read migrations from there.
    if (process.env.PIPALI_SERVER_RESOURCE_DIR) {
        return path.join(process.env.PIPALI_SERVER_RESOURCE_DIR, 'drizzle');
    }
    return `${process.cwd()}/drizzle`;
}

export { getDefaultUser, getMigrationsFolder, maxIterations };