import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getDbName, getPGliteConfig } from '../utils';

const dbName = getDbName();
const config = await getPGliteConfig();
const client = await PGlite.create(dbName, config);
export const db = drizzle(client);
