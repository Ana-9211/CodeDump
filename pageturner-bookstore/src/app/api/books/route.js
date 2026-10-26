import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { int, oneOf, str } from '@/lib/validate.js';

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
  const limit = int(query.limit ?? 12, 'Page size', { min: 1, max: 40 });
  const sort = oneOf(query.sort ?? 'newest', 'Sort', Object.keys(SORTS));

  const params = [];
  const bind = (v) => { params.push(v); return `$${params.length}`; };
  const where = ["status = 'approved'"];

  if (query.q) {
    const q = str(query.q, 'Search', { max: 100 });
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const pq = bind(q), pl = bind(like), pi = bind(q.replace(/[- ]/g, '').toUpperCase());
    where.push(`(search_vector @@ websearch_to_tsquery('english', ${pq}) OR title ILIKE ${pl} OR authors ILIKE ${pl} OR isbn = ${pi})`);
  }
  if (query.category) {
    where.push(`category_id IN (SELECT category_id FROM fn_category_tree(${bind(int(query.category, 'Category', { min: 1 }))}))`);
  }
  if (query.inStock === '1') where.push('stock > 0');
  // FR-06: price range (rupees in the URL, paise in the database) and minimum rating
  if (query.minPrice) where.push(`price_cents >= ${bind(Math.round(int(query.minPrice, 'Minimum price', { min: 0, max: 10000000 }) * 100))}`);
  if (query.maxPrice) where.push(`price_cents <= ${bind(Math.round(int(query.maxPrice, 'Maximum price', { min: 0, max: 10000000 }) * 100))}`);
  if (query.minRating) where.push(`avg_rating >= ${bind(int(query.minRating, 'Minimum rating', { min: 1, max: 5 }))}`);

  const sql = `
    SELECT book_id, title, authors, category_id, category_name, store_name,
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
