import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { oneOf } from '@/lib/validate.js';

// The seller's own order lines. Row level security removes everyone else's lines
// and orders, and the seller has no privilege at all on the payments table.
export const GET = api(async ({ session, query }) => {
  const status = oneOf(query.status, 'Status', ['Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'], { optional: true });
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT oi.order_item_id, o.order_number, o.placed_at, oi.title_snapshot AS title, oi.quantity,
              oi.line_total_cents, oi.fulfilment_status,
              o.ship_full_name, o.ship_line1, o.ship_line2, o.ship_city, o.ship_state, o.ship_postal_code, o.ship_phone
         FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
        WHERE ($1::text IS NULL OR oi.fulfilment_status = $1)
        ORDER BY o.placed_at DESC, oi.order_item_id DESC
        LIMIT 200`, [status ?? null])).rows);
  return { items: rows };
}, { roles: ['seller'] });
