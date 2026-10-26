import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { reviewService } from '@/lib/reviews.js';

// "Trending this week": the ranking comes from a MongoDB aggregation over view events,
// the book details come from PostgreSQL. If MongoDB is down the shelf is simply empty.
export const GET = api(async ({ session }) => {
  let ranking = [];
  try {
    ranking = await reviewService.trending({ days: 7, limit: 6 });
  } catch {
    return { items: [] };
  }
  if (ranking.length === 0) return { items: [] };

  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT book_id, title, authors, price_cents, avg_rating, review_count, category_name
         FROM v_book_catalog WHERE book_id = ANY($1::bigint[]) AND status = 'approved'`,
      [ranking.map((r) => r.bookId)])).rows);
  const byId = new Map(rows.map((b) => [b.book_id, b]));
  return { items: ranking.filter((r) => byId.has(r.bookId)).map((r) => ({ ...byId.get(r.bookId), views: r.views })) };
});
