// Authentication: bcrypt password hashes + a signed, httpOnly session cookie.
// The cookie only proves WHO you are. WHAT you may do is decided by PostgreSQL
// (roles, GRANTs, row level security) - the role is re-read from the database on every request,
// so suspending a user or changing a role takes effect immediately.
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { asApp } from './db.js';

export const COOKIE_NAME = 'bk_session';
const SESSION_SECONDS = 60 * 60; // 1 hour

function secret() {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!s || s.startsWith('change-me'))) {
    throw new Error('Set a strong JWT_SECRET before running in production.');
  }
  return s || 'development-only-secret';
}

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// compared against when the e-mail is unknown, so response time does not reveal which e-mails exist
let dummyHash;
export async function burnPasswordCheck(plain) {
  dummyHash ??= await bcrypt.hash('not-a-real-password', 10);
  await bcrypt.compare(plain, dummyHash);
}

export async function startSession({ userId, role }) {
  const token = jwt.sign({ sub: String(userId), role }, secret(), { algorithm: 'HS256', expiresIn: SESSION_SECONDS });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE_NAME);
}

/** Returns { userId, role, name } for a valid, still-active account - otherwise null. */
export async function getSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const [u] = await asApp('SELECT * FROM fn_get_session_user($1::bigint)', [Number(payload.sub)]);
  if (!u || u.status !== 'active') return null;
  return { userId: u.user_id, role: u.role_name, name: u.name };
}
