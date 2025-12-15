const maxIterations = parseInt(process.env.PANINI_RESEARCH_ITERATIONS || '15', 10);

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

function getMigrationsFolder(): string {
    // The migration folder from disk is only used in development mode.
    // In compiled mode, migrations are embedded, so this function is not used.
    return `${process.cwd()}/drizzle`;
}

export { getDefaultUser, getMigrationsFolder, maxIterations };