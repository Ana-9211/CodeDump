import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';

// Who am I? Also returns the cart size so the navbar can show a badge with one request.
export const GET = api(async ({ session }) => {
  if (!session) return { user: null, cartCount: 0 };
  let cartCount = 0;
  if (session.role === 'customer') {
    cartCount = await withRole(session, async (c) =>
      (await c.query('SELECT COALESCE(SUM(quantity), 0)::int AS n FROM cart_items')).rows[0].n);
  }
  const unread = await withRole(session, async (c) =>
    (await c.query('SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL')).rows[0].n);
  return { user: session, cartCount, unread };
});
