import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId, objectBody, oneOf } from '@/lib/validate.js';
import { HttpError } from '@/lib/errors.js';
import { charge, refund } from '@/lib/gateway.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT order_id, order_number, status, placed_at, total_cents, payment_method, payment_status, line_count
         FROM v_order_overview ORDER BY placed_at DESC, order_id DESC`)).rows);
  return { items: rows };
}, { roles: ['customer'] });

// Checkout (FR-13). Card/UPI are charged through the gateway adapter first; the order is only created after a
// successful charge, and the charge is refunded if creating the order fails. One call to the stored procedure = one
// atomic transaction (see sp_place_order). Card data is checked by the gateway and never reaches the database.
export const POST = api(async ({ request, session }) => {
  const body = objectBody(await readJson(request));
  const addressId = parseId(body.addressId, 'Delivery address');
  const method = oneOf(body.paymentMethod, 'Payment method', ['card', 'upi', 'cod']);

  let paid = null;
  if (method !== 'cod') {
    const total = await withRole(session, async (c) => (await c.query('SELECT total_cents FROM fn_cart_totals()')).rows[0]?.total_cents);
    if (!total) throw new HttpError(409, 'Your cart is empty.');
    paid = await charge({ method, amountCents: total, card: body.card, upi: body.upi });
  }
  try {
    const order = await withRole(session, async (c) => {
      const { rows: [{ p_order_id }] } = await c.query('CALL sp_place_order($1::bigint, $2::text, NULL::bigint, $3::text, $4::text)', [addressId, method, paid?.ref ?? null, paid?.detail ?? null]);
      return (await c.query('SELECT order_id, order_number, total_cents FROM orders WHERE order_id = $1', [p_order_id])).rows[0];
    });
    return { order, payment: paid ? { status: 'Paid', reference: paid.ref, detail: paid.detail } : { status: 'Pending' } };
  } catch (err) {
    if (paid) await refund(paid.ref);          // money taken but no order: give it back
    throw err;
  }
}, { roles: ['customer'] });
