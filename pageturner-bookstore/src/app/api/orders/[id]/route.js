import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId } from '@/lib/validate.js';

export const GET = api(async ({ session, params }) => {
  const orderId = parseId(params.id, 'Order');
  const result = await withRole(session, async (c) => {
    // row level security: a customer can only ever find their own orders
    const [order] = (await c.query(
      `SELECT order_id, order_number, status, placed_at, cancelled_at, subtotal_cents, tax_cents, shipping_cents, total_cents,
              ship_full_name, ship_line1, ship_line2, ship_city, ship_state, ship_postal_code, ship_country, ship_phone
         FROM orders WHERE order_id = $1`, [orderId])).rows;
    if (!order) return null;
    const items = (await c.query(
      `SELECT order_item_id, book_id, title_snapshot AS title, unit_price_cents, quantity, line_total_cents, fulfilment_status
         FROM order_items WHERE order_id = $1 ORDER BY order_item_id`, [orderId])).rows;
    const [payment] = (await c.query(
      'SELECT method, status, amount_cents, paid_at, transaction_ref, detail FROM payments WHERE order_id = $1', [orderId])).rows;
    return { order, items, payment: payment ?? null };
  });
  if (!result) throw new HttpError(404, 'Order not found.');
  return result;
}, { roles: ['customer'] });
