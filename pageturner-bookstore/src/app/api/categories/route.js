import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { catalogFilters } from '@/lib/catalogFilters.js';

// Whole category tree from the recursive CTE function fn_category_tree().
// With search/filter parameters (the same ones GET /api/books takes) each node also gets `filtered_books`: how many
// books of its whole sub-tree match those filters, so the number on a genre chip equals the list it opens.
export const GET = api(async ({ session, query }) => {
  const params = [];
  const bind = (v) => { params.push(v); return `$${params.length}`; };
  const where = ["status = 'approved'", ...catalogFilters(query, bind)];
  return withRole(session, async (c) => {
    const rows = (await c.query('SELECT * FROM fn_category_tree()')).rows;
    const direct = new Map(
      (await c.query(`SELECT category_id, count(*)::int AS n FROM v_book_catalog WHERE ${where.join(' AND ')} GROUP BY category_id`, params)).rows
        .map((r) => [r.category_id, r.n]));
    const parent = new Map(rows.map((r) => [r.category_id, r.parent_id]));
    const total = new Map(rows.map((r) => [r.category_id, 0]));
    for (const [id, n] of direct) {            // add each book count to its category and every ancestor
      for (let cur = id; cur != null && total.has(cur); cur = parent.get(cur)) total.set(cur, total.get(cur) + n);
    }
    return { items: rows.map((r) => ({ ...r, filtered_books: total.get(r.category_id) ?? 0 })) };
  });
});
