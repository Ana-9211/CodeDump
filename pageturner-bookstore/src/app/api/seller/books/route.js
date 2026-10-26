import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { parseBookInput, UPSERT_SQL, upsertParams } from '@/lib/bookInput.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT book_id, title, authors, isbn, description, language, category_id, category_name,
              price_cents, stock, status, rejection_reason, avg_rating, review_count
         FROM v_book_catalog
        WHERE seller_id = app_user_id() AND status <> 'removed'
        ORDER BY created_at DESC, book_id DESC`)).rows);
  return { items: rows };
}, { roles: ['seller'] });

// Create a listing. It starts as "pending" until an administrator approves it.
export const POST = api(async ({ request, session }) => {
  const input = parseBookInput(await readJson(request));
  const [{ id }] = await withRole(session, async (c) => (await c.query(UPSERT_SQL, upsertParams(null, input))).rows);
  return { bookId: id, status: 'pending' };
}, { roles: ['seller'] });
