import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId } from '@/lib/validate.js';

// PATCH = make this address the default
export const PATCH = api(async ({ session, params }) => {
  const addressId = parseId(params.id, 'Address');
  await withRole(session, async (c) => {
    const found = await c.query('SELECT 1 FROM addresses WHERE address_id = $1', [addressId]);
    if (found.rowCount === 0) throw new HttpError(404, 'Address not found.');
    await c.query('UPDATE addresses SET is_default = false WHERE is_default');
    await c.query('UPDATE addresses SET is_default = true WHERE address_id = $1', [addressId]);
  });
  return { ok: true };
}, { roles: ['customer'] });

export const DELETE = api(async ({ session, params }) => {
  const addressId = parseId(params.id, 'Address');
  const r = await withRole(session, (c) => c.query('DELETE FROM addresses WHERE address_id = $1', [addressId]));
  if (r.rowCount === 0) throw new HttpError(404, 'Address not found.');
  return { ok: true }; // old orders keep their own copy of the address, so they are unaffected
}, { roles: ['customer'] });
