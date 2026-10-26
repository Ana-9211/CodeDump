import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';

// Whole category tree from the recursive CTE function fn_category_tree()
export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) => (await c.query('SELECT * FROM fn_category_tree()')).rows);
  return { items: rows };
});
