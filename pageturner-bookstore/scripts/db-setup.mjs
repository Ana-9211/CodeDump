// One-command database setup:   npm run db:setup      (add --reset to rebuild from scratch)
//
//   1. create the database + cluster roles          (00_roles.sql)
//   2. tables, functions, triggers, views, security (01..05)
//   3. reference data: roles, settings, categories  (06)
//   4. demo users (bcrypt-hashed) + sample catalogue (07)
//   5. MongoDB collections, validators and indexes
//
// Needs a PostgreSQL superuser in DATABASE_ADMIN_URL (see .env.example).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { loadEnv } from '../src/lib/env.js';
import { setupMongo, closeMongo } from '../src/lib/mongo.js';

loadEnv();

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, '../db/postgres');
const reset = process.argv.includes('--reset');
const skipMongo = process.argv.includes('--skip-mongo');
const skipDemo = process.argv.includes('--no-demo');

const adminUrl = process.env.DATABASE_ADMIN_URL || 'postgres://postgres@127.0.0.1:5432/postgres';
const dbName = process.env.DB_NAME || 'bookstore_dbms';
if (!/^[a-z_][a-z0-9_]*$/i.test(dbName)) throw new Error('DB_NAME must be a plain identifier');

const dbUrl = new URL(adminUrl);
dbUrl.pathname = `/${dbName}`;

const sql = (file) => fs.readFileSync(path.join(sqlDir, file), 'utf8');
const say = (m) => console.log(m);

export const DEMO_PASSWORD = 'Passw0rd!';

async function main() {
  // ---- 1. database + roles -------------------------------------------------
  const root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  if (reset) {
    say(`Dropping database ${dbName} ...`);
    await root.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  }
  const exists = (await root.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])).rowCount > 0;
  if (!exists) {
    await root.query(`CREATE DATABASE ${dbName}`);
    say(`Created database ${dbName}`);
  }
  await root.query(sql('00_roles.sql'));
  if (process.env.APP_DB_PASSWORD) {
    const { rows } = await root.query("SELECT format('ALTER ROLE bookstore_app PASSWORD %L', $1::text) AS stmt", [process.env.APP_DB_PASSWORD]);
    await root.query(rows[0].stmt);
    say('Updated password of role bookstore_app');
  }
  say('Roles ready: bookstore_app, _guest, _customer, _seller, _admin');
  await root.end();

  // ---- 2-4. schema, logic, security, data ----------------------------------
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const already = (await db.query("SELECT to_regclass('public.users') AS t")).rows[0].t;
  if (already && !reset) {
    say('Schema already exists - skipping SQL files (use `npm run db:reset` to rebuild).');
  } else {
    for (const file of ['01_schema.sql', '02_functions.sql', '03_triggers.sql', '04_views.sql', '05_security.sql', '06_reference_data.sql', '08_features.sql', '09_audit_more.sql', '10_se_requirements.sql']) {
      await db.query(sql(file));
      say(`Ran ${file}`);
    }
    if (!skipDemo) {
      await seedDemoUsers(db);
      await db.query(sql('07_seed_catalog.sql'));
      say('Ran 07_seed_catalog.sql (36 sample books)');
    }
  }
  await db.end();

  // ---- 5. MongoDB ------------------------------------------------------------
  if (!skipMongo) {
    try {
      await setupMongo({ log: say, reset });
      say('MongoDB ready: collections reviews, book_views (validators + indexes)');
    } catch (err) {
      console.warn(`\nWARNING: MongoDB setup skipped (${err.message}).`);
      console.warn('Start MongoDB and run `npm run db:setup` again to enable reviews and trending.');
    } finally {
      await closeMongo().catch(() => {});
    }
  }
  say('\nDone. Demo logins (password for all: ' + DEMO_PASSWORD + '):');
  say('  admin@bookstore.test  seller1@bookstore.test  seller2@bookstore.test');
  say('  customer1@bookstore.test  customer2@bookstore.test');
}

async function seedDemoUsers(db) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    ['Asha Admin',  'admin@bookstore.test',     'admin',    null],
    ['Ravi Menon',  'seller1@bookstore.test',   'seller',   'Page Turner Books'],
    ['Divya Rao',   'seller2@bookstore.test',   'seller',   'Campus Corner'],
    ['Karan Shah',  'customer1@bookstore.test', 'customer', null],
    ['Meera Iyer',  'customer2@bookstore.test', 'customer', null],
  ];
  for (const [name, email, role, store] of users) {
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, role_id, email_verified_at) SELECT $1, $2, $3, role_id, now() FROM roles WHERE role_name = $4 RETURNING user_id',
      [name, email, hash, role],
    );
    if (store) await db.query('INSERT INTO seller_profiles (user_id, store_name, description) VALUES ($1, $2, $3)', [rows[0].user_id, store, `${store} - demo seller`]);
  }
  await db.query(`
    INSERT INTO addresses (user_id, label, full_name, line1, city, state, postal_code, phone, is_default)
    SELECT user_id, 'Home', name, '12 MG Road', 'Bengaluru', 'Karnataka', '560001', '9876543210', true
      FROM users WHERE email IN ('customer1@bookstore.test', 'customer2@bookstore.test')`);
  say('Created 5 demo users (1 admin, 2 sellers, 2 customers)');
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});
