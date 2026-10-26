import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { objectBody } from '@/lib/validate.js';

export const GET = api(async ({ session }) => {
  const items = await withRole(session, async (c) =>
    (await c.query('SELECT notification_id, kind, subject, body, link, read_at, created_at FROM notifications ORDER BY created_at DESC, notification_id DESC LIMIT 50')).rows);
  return { items, unread: items.filter((n) => !n.read_at).length };
}, { roles: ['customer', 'seller', 'admin'] });

// mark everything (or one notification) as read
export const POST = api(async ({ request, session }) => {
  const b = objectBody(await readJson(request).catch(() => ({})));
  await withRole(session, (c) =>
    c.query('UPDATE notifications SET read_at = now() WHERE read_at IS NULL AND ($1::bigint IS NULL OR notification_id = $1)', [b.id ?? null]));
  return { ok: true };
}, { roles: ['customer', 'seller', 'admin'] });
