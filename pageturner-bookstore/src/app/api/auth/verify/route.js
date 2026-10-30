import { api, readJson } from '@/lib/http.js';
import { asApp } from '@/lib/db.js';
import { sha256 } from '@/lib/verify.js';
import { HttpError } from '@/lib/errors.js';
import { objectBody, str } from '@/lib/validate.js';

// FR-01: the link in the welcome e-mail lands on /verify-email, which posts the token here.
export const POST = api(async ({ request }) => {
  const body = objectBody(await readJson(request));
  const token = str(body.token, 'Token', { max: 200 });
  const [{ ok }] = await asApp('SELECT fn_verify_email($1) AS ok', [sha256(token)]);
  if (!ok) throw new HttpError(400, 'This verification link is invalid, already used or has expired.');
  return { message: 'Your e-mail address is verified.' };
});
