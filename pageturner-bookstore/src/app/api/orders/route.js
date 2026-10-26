import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId, objectBody, oneOf } from '@/lib/validate.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT order_id, order_number, status, placed_at, total_cents, payment_method, payment_status, line_count
         FROM v_order_overview ORDER BY placed_at DESC, order_id DESC`)).rows);
  return { items: rows };
}, { roles: ['customer'] });

// Checkout. One call to the stored procedure = one atomic transaction (see sp_place_order).
export const POST = api(async ({ request, session }) => {
  const body = objectBody(await readJson(request));
  const addressId = parseId(body.addressId, 'Delivery address');
  const method = oneOf(body.paymentMethod, 'Payment method', ['card', 'upi', 'cod']);
  const order = await withRole(session, async (c) => {
    const { rows: [{ p_order_id }] } = await c.query('CALL sp_place_order($1::bigint, $2::text, NULL::bigint)', [addressId, method]);
    return (await c.query('SELECT order_id, order_number, total_cents FROM orders WHERE order_id = $1', [p_order_id])).rows[0];
  });
  return { order };
}, { roles: ['customer'] });
