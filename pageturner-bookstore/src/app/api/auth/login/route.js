import { api, readJson } from '@/lib/http.js';
import { asApp } from '@/lib/db.js';
import { burnPasswordCheck, startSession, verifyPassword } from '@/lib/auth.js';
import { HttpError } from '@/lib/errors.js';
import { objectBody } from '@/lib/validate.js';

export const POST = api(async ({ request }) => {
  const body = objectBody(await readJson(request));
  const mail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const pw = typeof body.password === 'string' ? body.password : '';
  if (!mail || !pw) throw new HttpError(400, 'Enter your e-mail and password.');

  const [u] = await asApp('SELECT * FROM fn_get_login($1)', [mail]);

  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    throw new HttpError(429, 'Too many failed attempts. This account is locked for a few minutes.');
  }
  if (!u) {
    await burnPasswordCheck(pw);
    throw new HttpError(401, 'Invalid e-mail or password.');
  }
  if (!(await verifyPassword(pw, u.password_hash))) {
    await asApp('SELECT fn_record_login($1::bigint, false)', [u.user_id]);
    throw new HttpError(401, 'Invalid e-mail or password.');
  }
  if (u.status !== 'active') throw new HttpError(403, 'This account has been suspended. Contact support.');

  await asApp('SELECT fn_record_login($1::bigint, true)', [u.user_id]);
  await startSession({ userId: u.user_id, role: u.role_name });
  return { user: { userId: u.user_id, role: u.role_name, name: u.name } };
});
