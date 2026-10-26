import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId, objectBody, str } from '@/lib/validate.js';

export const PATCH = api(async ({ request, session, params }) => {
  const id = parseId(params.id, 'Category');
  const name = str(objectBody(await readJson(request)).name, 'Name', { max: 80 });
  const r = await withRole(session, (c) => c.query('UPDATE categories SET name = $2 WHERE category_id = $1', [id, name]));
  if (r.rowCount === 0) throw new HttpError(404, 'Category not found.');
  return { ok: true };
}, { roles: ['admin'] });

// guarded by fn_delete_category: no sub-categories and no books may remain
export const DELETE = api(async ({ session, params }) => {
  await withRole(session, (c) => c.query('SELECT fn_delete_category($1::int)', [parseId(params.id, 'Category')]));
  return { ok: true };
}, { roles: ['admin'] });
