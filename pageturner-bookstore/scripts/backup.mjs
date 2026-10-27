// VFR-14: database backup. Writes a timestamped pg_dump (custom format) and, when MongoDB is running, a JSON export
// of the reviews/book_views collections. Restore:  pg_restore -d bookstore_dbms --clean backups/<file>.dump
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/lib/env.js';

loadEnv();
const dir = path.resolve(process.argv[2] || 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const u = new URL(process.env.DATABASE_ADMIN_URL || 'postgres://postgres@127.0.0.1:5432/postgres');
u.pathname = `/${process.env.DB_NAME || 'bookstore_dbms'}`;

const file = path.join(dir, `bookstore-${stamp}.dump`);
execFileSync('pg_dump', ['--format=custom', '--no-owner', `--file=${file}`, u.toString()], { stdio: 'inherit' });
console.log(`PostgreSQL backup: ${file} (${fs.statSync(file).size} bytes)`);

try {
  const { getMongoDb, closeMongo } = await import('../src/lib/mongo.js');
  const db = await getMongoDb();
  const out = {};
  for (const name of ['reviews', 'book_views']) out[name] = await db.collection(name).find({}).toArray();
  const mfile = path.join(dir, `bookstore-mongo-${stamp}.json`);
  fs.writeFileSync(mfile, JSON.stringify(out));
  console.log(`MongoDB backup:    ${mfile}`);
  await closeMongo();
} catch (e) {
  console.log(`MongoDB backup skipped (${e.message.split('\n')[0]})`);
}
process.exit(0);
