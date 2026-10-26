import { api, readJson } from '@/lib/http.js';
import { asApp, withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId, int, objectBody, oneOf } from '@/lib/validate.js';
import { reviewService } from '@/lib/reviews.js';

async function assertBookVisible(session, bookId) {
  const rows = await withRole(session, async (c) => (await c.query('SELECT 1 FROM books WHERE book_id = $1', [bookId])).rows);
  if (rows.length === 0) throw new HttpError(404, 'Book not found.');
}

// READ: reviews (paged, sortable) + rating summary computed by a MongoDB aggregation
export const GET = api(async ({ session, params, query }) => {
  const bookId = parseId(params.id, 'Book id');
  await assertBookVisible(session, bookId);
  const page = int(query.page ?? 1, 'Page', { min: 1, max: 1000 });
  const sort = oneOf(query.sort ?? 'newest', 'Sort', ['newest', 'helpful']);

  const viewerId = session?.userId ?? null;
  const [list, summary, mine] = await Promise.all([
    reviewService.list(bookId, { page, limit: 8, sort, viewerId }),
    reviewService.summary(bookId),
    session ? reviewService.mine(bookId, session.userId) : null,
  ]);
  let canReview = false;
  if (session?.role === 'customer' && !mine) {
    const [{ ok }] = await asApp('SELECT fn_has_purchased($1::bigint, $2::bigint) AS ok', [session.userId, bookId]);
    canReview = ok;
  }
  return { ...list, summary, mine, canReview };
});

// CREATE: only customers who actually bought the book (verified purchase) may review it
export const POST = api(async ({ request, session, params }) => {
  const bookId = parseId(params.id, 'Book id');
  const body = objectBody(await readJson(request));
  await assertBookVisible(session, bookId);
  const [{ ok }] = await asApp('SELECT fn_has_purchased($1::bigint, $2::bigint) AS ok', [session.userId, bookId]);
  if (!ok) throw new HttpError(403, 'Only customers who bought this book can review it.');
  return reviewService.create({ bookId, userId: session.userId, userName: session.name }, body);
}, { roles: ['customer'] });
