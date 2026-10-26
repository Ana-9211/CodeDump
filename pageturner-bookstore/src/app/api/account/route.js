import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { objectBody, str } from '@/lib/validate.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query('SELECT user_id, name, email, phone, created_at FROM users WHERE user_id = app_user_id()')).rows);
  let application = null;
  if (session.role === 'customer') {
    application = (await withRole(session, async (c) =>
      (await c.query('SELECT application_id, store_name, status, review_note, created_at FROM seller_applications ORDER BY application_id DESC LIMIT 1')).rows))[0] ?? null;
  }
  return { account: rows[0], application };
}, { roles: ['customer', 'seller', 'admin'] });

// FR-18: edit own profile. The database only allows the name and phone columns, and only on your own row.
export const PATCH = api(async ({ request, session }) => {
  const b = objectBody(await readJson(request));
  const name = str(b.name, 'Name', { max: 100 });
  const phone = str(b.phone, 'Phone', { max: 15, optional: true }) ?? null;
  await withRole(session, (c) => c.query('UPDATE users SET name = $1, phone = $2 WHERE user_id = app_user_id()', [name, phone]));
  return { ok: true };
}, { roles: ['customer', 'seller'] });
