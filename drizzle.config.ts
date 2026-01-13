import type { Config } from 'drizzle-kit';
import { getDatabaseDir } from './src/server/paths';

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  driver: 'pglite',
  dbCredentials: {
    url: process.env.POSTGRES_DB || getDatabaseDir()
  }
} satisfies Config;
