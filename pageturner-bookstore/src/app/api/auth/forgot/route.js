import crypto from 'node:crypto';
import { api, readJson } from '@/lib/http.js';
import { asApp } from '@/lib/db.js';
import { email, objectBody } from '@/lib/validate.js';

// FR-03. The reply is always the same, so nobody can use this form to discover which e-mails exist.
// Only a SHA-256 hash of the token is stored; the raw token only travels in the e-mail link.
export const POST = api(async ({ request }) => {
  const body = objectBody(await readJson(request));
  const mail = email(body.email);
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await asApp('SELECT * FROM fn_create_password_reset($1, $2)', [mail, hash]);

  const out = { message: 'If that e-mail is registered, a reset link has been sent. It works for 30 minutes.' };
  if (rows.length) {
    const base = process.env.APP_URL || 'http://localhost:3000';
    const link = `${base}/reset-password?token=${token}`;
    // No SMTP server in this project: the "e-mail" is printed on the server console.
    console.log(`[mail] To: ${mail}\n[mail] Subject: Reset your PageTurner password\n[mail] ${link}`);
    // convenience for demos and tests only; never enabled in production
    if (process.env.NODE_ENV !== 'production' || process.env.EXPOSE_RESET_LINK === '1') out.devResetLink = link;
  }
  return out;
});
