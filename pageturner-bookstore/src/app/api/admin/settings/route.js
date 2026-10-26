import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { int, objectBody, str } from '@/lib/validate.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query('SELECT setting_key, setting_value, description FROM app_settings ORDER BY setting_key')).rows);
  return { items: rows };
}, { roles: ['admin'] });

// Business constants (tax rate, shipping fee ...) are data, so an admin can tune them without a deploy
export const PATCH = api(async ({ request, session }) => {
  const body = objectBody(await readJson(request));
  const key = str(body.key, 'Setting', { max: 40 });
  const value = int(body.value, 'Value', { min: 0, max: key === 'tax_rate_percent' ? 100 : 100000000 });
  const r = await withRole(session, (c) => c.query('UPDATE app_settings SET setting_value = $2 WHERE setting_key = $1', [key, value]));
  if (r.rowCount === 0) throw new HttpError(404, 'Unknown setting.');
  return { ok: true };
}, { roles: ['admin'] });
