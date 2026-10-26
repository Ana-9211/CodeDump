import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId } from '@/lib/validate.js';

// Cancel before shipping. Triggers return the stock and roll the order status up.
export const POST = api(async ({ session, params }) => {
  const orderId = parseId(params.id, 'Order');
  await withRole(session, (c) => c.query('CALL sp_cancel_order($1::bigint)', [orderId]));
  return { ok: true };
}, { roles: ['customer'] });
