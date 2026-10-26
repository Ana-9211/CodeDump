import crypto from 'node:crypto';
import { api, readJson } from '@/lib/http.js';
import { asApp } from '@/lib/db.js';
import { hashPassword } from '@/lib/auth.js';
import { HttpError } from '@/lib/errors.js';
import { objectBody, password, str } from '@/lib/validate.js';

export const POST = api(async ({ request }) => {
  const body = objectBody(await readJson(request));
  const token = str(body.token, 'Reset link', { min: 64, max: 64 });
  const pw = password(body.password);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const [{ ok }] = await asApp('SELECT fn_reset_password($1, $2) AS ok', [hash, await hashPassword(pw)]);
  if (!ok) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  return { ok: true };
});
