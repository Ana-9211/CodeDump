import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { int, oneOf } from '@/lib/validate.js';
import { catalogFilters } from '@/lib/catalogFilters.js';

const SORTS = {
  newest: 'created_at DESC',
  price_asc: 'price_cents ASC',
  price_desc: 'price_cents DESC',
  rating: 'avg_rating DESC, review_count DESC',
  title: 'lower(title) ASC',
};

// Catalogue: search + category (with all sub-categories) + sort + pagination.
// Every value reaches SQL as a bound parameter ($1, $2 ...), never by string concatenation.
export const GET = api(async ({ session, query }) => {
  const page = int(query.page ?? 1, 'Page', { min: 1, max: 10000 });
  const limit = int(query.limit ?? 20, 'Page size', { min: 1, max: 40 });
  const sort = oneOf(query.sort ?? 'newest', 'Sort', Object.keys(SORTS));

  const params = [];
  const bind = (v) => { params.push(v); return `$${params.length}`; };
  const where = ["status = 'approved'"];

  where.push(...catalogFilters(query, bind));
  if (query.category) {
    where.push(`category_id IN (SELECT category_id FROM fn_category_tree(${bind(int(query.category, 'Category', { min: 1 }))}))`);
  }

  const sql = `
    SELECT book_id, title, authors, category_id, category_name, store_name, cover_url,
           price_cents, stock, avg_rating, review_count, created_at,
           count(*) OVER () AS total
      FROM v_book_catalog
     WHERE ${where.join(' AND ')}
     ORDER BY ${SORTS[sort]}, book_id
     LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`;

  const rows = await withRole(session, async (c) => (await c.query(sql, params)).rows);
  const total = rows[0]?.total ?? 0;
  return {
    items: rows.map(({ total: _t, ...book }) => book),
    total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
  };
});
