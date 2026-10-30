import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId, objectBody } from '@/lib/validate.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT v.book_id, v.title, v.authors, v.cover_url, v.price_cents, v.stock, v.avg_rating, v.review_count, v.category_name, w.added_at
         FROM wishlist_items w JOIN v_book_catalog v ON v.book_id = w.book_id
        WHERE v.status = 'approved' ORDER BY w.added_at DESC`)).rows);
  return { items: rows };
}, { roles: ['customer'] });

export const POST = api(async ({ request, session }) => {
  const bookId = parseId(objectBody(await readJson(request)).bookId, 'Book');
  await withRole(session, (c) =>
    c.query('INSERT INTO wishlist_items (user_id, book_id) VALUES (app_user_id(), $1) ON CONFLICT DO NOTHING', [bookId]));
  return { ok: true };
}, { roles: ['customer'] });
