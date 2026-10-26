import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { hashPassword, verifyPassword } from '@/lib/auth.js';
import { HttpError } from '@/lib/errors.js';
import { objectBody, password } from '@/lib/validate.js';

export const POST = api(async ({ request, session }) => {
  const b = objectBody(await readJson(request));
  const next = password(b.newPassword);
  const hash = await withRole(session, async (c) => (await c.query('SELECT fn_get_own_hash() AS h')).rows[0].h);
  if (typeof b.currentPassword !== 'string' || !(await verifyPassword(b.currentPassword, hash))) {
    throw new HttpError(400, 'Your current password is not correct.');
  }
  const newHash = await hashPassword(next);
  await withRole(session, (c) => c.query('SELECT fn_set_own_password($1)', [newHash]));
  return { ok: true };
}, { roles: ['customer', 'seller', 'admin'] });
