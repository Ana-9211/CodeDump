import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { int, objectBody, str } from '@/lib/validate.js';

export const POST = api(async ({ request, session }) => {
  const b = objectBody(await readJson(request));
  const name = str(b.name, 'Name', { max: 80 });
  const parentId = b.parentId ? int(b.parentId, 'Parent', { min: 1 }) : null;
  const row = await withRole(session, async (c) =>
    (await c.query('INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING category_id', [name, parentId])).rows[0]);
  return { categoryId: row.category_id };
}, { roles: ['admin'] });
