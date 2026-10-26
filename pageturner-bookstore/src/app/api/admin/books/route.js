import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { oneOf } from '@/lib/validate.js';

export const GET = api(async ({ session, query }) => {
  const status = oneOf(query.status ?? 'pending', 'Status', ['pending', 'approved', 'rejected', 'removed', 'all']);
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT book_id, title, authors, isbn, category_name, store_name, price_cents, stock, status, rejection_reason, created_at
         FROM v_book_catalog WHERE ($1 = 'all' OR status = $1)
        ORDER BY created_at DESC, book_id DESC LIMIT 200`, [status])).rows);
  return { items: rows };
}, { roles: ['admin'] });
