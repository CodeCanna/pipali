import { migrate } from "drizzle-orm/pglite/migrator";
import { db } from "./db";
import api from "./routes/api";
import { initializeDatabase } from "./init";
import { getMigrationsFolder } from "./utils";

async function main() {
  await migrate(db, { migrationsFolder: getMigrationsFolder() });
  await initializeDatabase();

  const server = Bun.serve({
    fetch: api.fetch,
    port: 3000,
  });

  console.log(`Server listening on http://localhost:${server.port}`);
}

main();
