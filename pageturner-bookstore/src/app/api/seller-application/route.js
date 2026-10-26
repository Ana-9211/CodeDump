import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { objectBody, str } from '@/lib/validate.js';

// FR-19: a customer applies to sell. The admin decides (FR-25).
export const POST = api(async ({ request, session }) => {
  const b = objectBody(await readJson(request));
  const store = str(b.storeName, 'Store name', { max: 80 });
  const reason = str(b.reason, 'Reason', { max: 500, optional: true }) ?? '';
  const id = await withRole(session, async (c) => (await c.query('SELECT fn_apply_seller($1, $2) AS id', [store, reason])).rows[0].id);
  return { applicationId: id };
}, { roles: ['customer'] });
