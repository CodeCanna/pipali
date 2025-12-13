import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { db } from "./db";
import app from "./routes";
import api from "./routes/api";
import { initializeDatabase } from "./init";
import { getMigrationsFolder } from "./utils";
import { websocketHandler, type WebSocketData } from "./routes/ws";
import {
    IS_COMPILED_BINARY,
    EMBEDDED_MIGRATIONS,
} from "./embedded-assets";

async function runEmbeddedMigrations() {
    console.log("Running embedded migrations...");

    // Create migrations table if it doesn't exist
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )
    `);

    // Get already applied migrations
    const applied = await db.execute(sql`SELECT hash FROM "__drizzle_migrations"`);
    const appliedHashes = new Set((applied.rows as any[]).map(r => r.hash));

    // Run each migration that hasn't been applied
    for (const migration of EMBEDDED_MIGRATIONS) {
        const hash = migration.tag;

        if (appliedHashes.has(hash)) {
            console.log(`  ⏭️  Skipping ${hash} (already applied)`);
            continue;
        }

        console.log(`  🔄 Running migration: ${hash}`);

        // Split by the Drizzle breakpoint marker and execute each statement
        const statements = migration.sql.split('--> statement-breakpoint');

        for (const statement of statements) {
            const trimmed = statement.trim();
            if (trimmed) {
                await db.execute(sql.raw(trimmed));
            }
        }

        // Record the migration
        await db.execute(sql`
            INSERT INTO "__drizzle_migrations" (hash, created_at)
            VALUES (${hash}, ${Date.now()})
        `);

        console.log(`  ✅ Applied: ${hash}`);
    }

    console.log("Migrations complete.");
}

async function main() {
    // Run migrations - either embedded or from disk
    if (IS_COMPILED_BINARY) {
        await runEmbeddedMigrations();
    } else {
        await migrate(db, { migrationsFolder: getMigrationsFolder() });
    }

    await initializeDatabase();

    // Build frontend only in development mode (not when running as compiled binary)
    if (!IS_COMPILED_BINARY) {
        console.log("Building frontend...");
        await Bun.build({
            entrypoints: ["src/client/app.tsx"],
            outdir: "src/client/dist",
        });
        console.log("Frontend built.");
    } else {
        console.log("Running in compiled mode - using embedded assets.");
    }

  const server = Bun.serve<WebSocketData, any>({
    async fetch(req, server) {
        const url = new URL(req.url);
        console.log(`[${req.method}] ${url.pathname}`);

        // WebSocket
        if (url.pathname === "/ws/chat") {
            const success = server.upgrade(req, {
                data: {
                    // Initialize data if needed
                }
            });
            if (success) {
                return undefined;
            }
        }

        // API
        if (url.pathname.startsWith("/api")) {
            const res = await api.fetch(req, server);
            return res;
        }

        // Static and frontend routes
        const res = await app.fetch(req, server);
        return res;
    },
    websocket: websocketHandler,
    port: 3000,
    development: !IS_COMPILED_BINARY,
  });

  console.log(`Server listening on http://localhost:${server.port}`);
}

main();
