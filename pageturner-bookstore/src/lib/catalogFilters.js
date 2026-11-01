// The catalogue filters shared by GET /api/books and GET /api/categories, so the numbers on the genre chips are
// computed with exactly the same conditions as the book list. Every value is bound as a parameter, never concatenated.
import { HttpError } from './errors.js';
import { int, str } from './validate.js';

// price boxes accept rupees with or without decimals ("99" or "99.50")
function rupees(value, name) {
  const n = typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new HttpError(400, `${name} must be an amount of 0 or more.`);
  return Math.round(n * 100);
}

/** Returns the WHERE conditions for the search box and the filter panel (not the category, not the sort). */
export function catalogFilters(query, bind) {
  const where = [];
  if (query.q) {
    const q = str(query.q, 'Search', { max: 100 });
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const pq = bind(q), pl = bind(like), pi = bind(q.replace(/[- ]/g, '').toUpperCase());
    where.push(`(search_vector @@ websearch_to_tsquery('english', ${pq}) OR title ILIKE ${pl} OR authors ILIKE ${pl} OR category_name ILIKE ${pl} OR isbn = ${pi})`);
  }
  if (query.inStock === '1') where.push('stock > 0');
  if (query.language) where.push(`language = ${bind(str(query.language, 'Language', { max: 30 }))}`);
  // FR-06: price range (rupees in the URL, paise in the database) and minimum rating
  if (query.minPrice) where.push(`price_cents >= ${bind(rupees(query.minPrice, 'Minimum price'))}`);
  if (query.maxPrice) where.push(`price_cents <= ${bind(rupees(query.maxPrice, 'Maximum price'))}`);
  if (query.minRating) where.push(`avg_rating >= ${bind(int(query.minRating, 'Minimum rating', { min: 1, max: 5 }))}`);
  return where;
}
