// PostgreSQL access layer.
//
// The app logs in as ONE low-privilege role (bookstore_app) that, by itself, can
// do almost nothing. For every request we open a transaction and step into the
// role that matches the signed-in user:
//
//     BEGIN;
//     SET LOCAL ROLE bookstore_customer;          -- GRANTs now apply
//     SELECT set_config('app.user_id', '42', true);  -- RLS policies now apply
//     ... the request's queries ...
//     COMMIT;
//
// Because both settings are transaction-local, they cannot leak to the next request
// that reuses the same pooled connection.
import pg from 'pg';

// bigint -> number, numeric -> number, date -> 'YYYY-MM-DD' string (all safe at this scale)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

const { Pool } = pg;

const DEFAULT_URL = 'postgres://bookstore_app:bookstore_app_pw@127.0.0.1:5432/bookstore_dbms';

const g = globalThis;
export const pool =
  g.__bookstorePool ??
  new Pool({ connectionString: process.env.DATABASE_URL || DEFAULT_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') g.__bookstorePool = pool;
// an idle connection can be dropped by the server (restart, admin kill); the pool replaces it,
// but without a listener Node would treat the event as a crash
if (!g.__bookstorePoolListening) {
  pool.on('error', (err) => console.error('[pg pool] idle client error:', err.message));
  g.__bookstorePoolListening = true;
}

// whitelist: the role name is interpolated into SQL, so it must never come from user input
const ROLE_MAP = Object.freeze({
  guest: 'bookstore_guest',
  customer: 'bookstore_customer',
  seller: 'bookstore_seller',
  admin: 'bookstore_admin',
});

/**
 * Run `fn(client)` inside a transaction as the database role of `session`
 * (or the guest role when session is null).
 */
export async function withRole(session, fn) {
  const dbRole = ROLE_MAP[session ? session.role : 'guest'];
  if (!dbRole) throw new Error('unknown role');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${dbRole}`);
    await client.query("SELECT set_config('app.user_id', $1, true)", [session ? String(session.userId) : '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Calls that happen BEFORE a role is known (login/register) or bridge to MongoDB. Runs as bookstore_app. */
export async function asApp(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}
