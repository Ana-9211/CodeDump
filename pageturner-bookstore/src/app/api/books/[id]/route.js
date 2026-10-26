import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId } from '@/lib/validate.js';
import { reviewService } from '@/lib/reviews.js';

export const GET = api(async ({ session, params }) => {
  const bookId = parseId(params.id, 'Book id');
  // No status filter on purpose: PostgreSQL row level security decides what this role may see
  // (visitors/customers: approved only; a seller also their own drafts; admin everything).
  const [book] = await withRole(session, async (c) =>
    (await c.query(
      `SELECT book_id, title, authors, description, language, isbn, category_id, category_name,
              store_name, seller_id, price_cents, stock, status, avg_rating, review_count
         FROM v_book_catalog WHERE book_id = $1`, [bookId])).rows);
  if (!book) throw new HttpError(404, 'Book not found.');

  if (book.status === 'approved') {
    // click-stream event in MongoDB; a failure here must never break the page
    reviewService.recordView(bookId, session?.userId ?? null).catch(() => {});
  }
  return { book };
});
