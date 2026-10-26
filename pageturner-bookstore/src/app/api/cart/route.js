import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId, int, objectBody } from '@/lib/validate.js';

async function loadCart(session) {
  return withRole(session, async (c) => {
    const items = (await c.query(
      `SELECT ci.book_id, ci.quantity, v.title, v.authors, v.price_cents, v.stock,
              ci.quantity * v.price_cents AS line_total_cents
         FROM cart_items ci JOIN v_book_catalog v ON v.book_id = ci.book_id
        ORDER BY ci.added_at, ci.book_id`)).rows;
    const [totals] = (await c.query('SELECT * FROM fn_cart_totals()')).rows;
    return { items, totals };
  });
}

export const GET = api(async ({ session }) => loadCart(session), { roles: ['customer'] });

// POST = "add to cart" (adds to what is already there, max 10)
export const POST = api(async ({ request, session }) => {
  const body = objectBody(await readJson(request));
  const bookId = parseId(body.bookId, 'Book');
  const quantity = int(body.quantity ?? 1, 'Quantity', { min: 1, max: 10 });
  await withRole(session, (c) =>
    c.query(
      `INSERT INTO cart_items (user_id, book_id, quantity) VALUES (app_user_id(), $1, $2)
       ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 10)`,
      [bookId, quantity]));
  return loadCart(session);
}, { roles: ['customer'] });

// PUT = "set quantity" (cart page +/- buttons)
export const PUT = api(async ({ request, session }) => {
  const body = objectBody(await readJson(request));
  const bookId = parseId(body.bookId, 'Book');
  const quantity = int(body.quantity, 'Quantity', { min: 1, max: 10 });
  await withRole(session, (c) =>
    c.query(
      `INSERT INTO cart_items (user_id, book_id, quantity) VALUES (app_user_id(), $1, $2)
       ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
      [bookId, quantity]));
  return loadCart(session);
}, { roles: ['customer'] });
