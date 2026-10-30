import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId } from '@/lib/validate.js';
import { refund } from '@/lib/gateway.js';

// Cancel before shipping. Triggers return the stock and roll the order status up.
export const POST = api(async ({ session, params }) => {
  const orderId = parseId(params.id, 'Order');
  const paid = await withRole(session, async (c) =>
    (await c.query("SELECT transaction_ref FROM payments WHERE order_id = $1 AND status = 'Paid'", [orderId])).rows[0]);
  await withRole(session, (c) => c.query('CALL sp_cancel_order($1::bigint)', [orderId]));
  if (paid) await refund(paid.transaction_ref);   // FR-13: the gateway returns the money
  return { ok: true };
}, { roles: ['customer'] });
