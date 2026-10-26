import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from '../src/lib/env.js';

loadEnv();
// numbers instead of strings for bigint/numeric (same as the app)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => parseFloat(v));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Rebuild the SQL database from scratch so every test run starts from the same data. */
export function resetDatabase() {
  execFileSync('node', ['scripts/db-setup.mjs', '--reset', '--skip-mongo'], { cwd: root, stdio: 'ignore' });
}

/** Superuser connection (bypasses RLS) - used only to arrange data and inspect results. */
export async function adminClient() {
  const u = new URL(process.env.DATABASE_ADMIN_URL || 'postgres://postgres@127.0.0.1:5432/postgres');
  u.pathname = `/${process.env.DB_NAME || 'bookstore_dbms'}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}

export const PASSWORD = 'Passw0rd!';
