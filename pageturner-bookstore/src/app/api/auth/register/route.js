import { api, readJson } from '@/lib/http.js';
import { asApp } from '@/lib/db.js';
import { hashPassword, startSession } from '@/lib/auth.js';
import { email, objectBody, oneOf, password, str } from '@/lib/validate.js';

// Sign-up: creates a customer or a seller. Admins can never be self-registered
// (fn_register_user refuses any other role inside the database as well).
export const POST = api(async ({ request }) => {
  const body = objectBody(await readJson(request));
  const role = oneOf(body.role ?? 'customer', 'Account type', ['customer', 'seller']);
  const name = str(body.name, 'Name', { max: 100 });
  const mail = email(body.email);
  const pw = password(body.password);
  const storeName = role === 'seller' ? str(body.storeName, 'Store name', { max: 80 }) : null;

  const [{ id }] = await asApp('SELECT fn_register_user($1, $2, $3, $4, $5) AS id', [name, mail, await hashPassword(pw), role, storeName]);
  await startSession({ userId: id, role });
  return { user: { userId: id, role, name } };
});
