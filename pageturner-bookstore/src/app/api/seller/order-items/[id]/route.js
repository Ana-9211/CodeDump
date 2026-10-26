import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId, objectBody, oneOf } from '@/lib/validate.js';

// Move an order line forward: Packed -> Shipped -> Delivered (or Cancelled).
// The trigger rejects illegal jumps, returns stock on cancel and updates the order's overall status.
export const PATCH = api(async ({ request, session, params }) => {
  const itemId = parseId(params.id, 'Order line');
  const body = objectBody(await readJson(request));
  const status = oneOf(body.status, 'Status', ['Packed', 'Shipped', 'Delivered', 'Cancelled']);
  const r = await withRole(session, (c) =>
    c.query('UPDATE order_items SET fulfilment_status = $2 WHERE order_item_id = $1', [itemId, status]));
  if (r.rowCount === 0) throw new HttpError(404, 'Order line not found.');
  return { ok: true };
}, { roles: ['seller'] });
