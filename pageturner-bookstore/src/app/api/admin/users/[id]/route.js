import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId, objectBody, oneOf } from '@/lib/validate.js';

// Suspend / reactivate. The database refuses to let an admin change their own row (RLS)
// and the column privilege means this role can change `status` and nothing else on users.
export const PATCH = api(async ({ request, session, params }) => {
  const userId = parseId(params.id, 'User');
  const body = objectBody(await readJson(request));
  const status = oneOf(body.status, 'Status', ['active', 'suspended']);
  const r = await withRole(session, (c) =>
    c.query('UPDATE users SET status = $2 WHERE user_id = $1 AND role_id <> 3', [userId, status]));
  if (r.rowCount === 0) throw new HttpError(409, 'That account does not exist, is your own, or is an administrator.');
  return { ok: true };
}, { roles: ['admin'] });
