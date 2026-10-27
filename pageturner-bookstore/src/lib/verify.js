// FR-01: e-mail verification. Only the SHA-256 hash of the token is stored; the raw token only
// travels inside the e-mailed link.
import crypto from 'node:crypto';
import { asApp } from './db.js';
import { sendMail } from './mailer.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function sendVerification(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const rows = await asApp('SELECT * FROM fn_create_email_verification($1::bigint, $2)', [userId, sha256(token)]);
  if (!rows.length) return null;                                  // already verified
  const link = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  await sendMail({ to: rows[0].email, name: rows[0].name, subject: 'Confirm your PageTurner e-mail address',
                   text: `Welcome, ${rows[0].name}! Confirm your address (link valid for 24 hours): ${link}` });
  return process.env.NODE_ENV !== 'production' || process.env.EXPOSE_RESET_LINK === '1' ? link : null;
}
