import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId } from '@/lib/validate.js';

export const DELETE = api(async ({ session, params }) => {
  const bookId = parseId(params.bookId, 'Book');
  await withRole(session, (c) => c.query('DELETE FROM cart_items WHERE book_id = $1', [bookId]));
  return { ok: true };
}, { roles: ['customer'] });
