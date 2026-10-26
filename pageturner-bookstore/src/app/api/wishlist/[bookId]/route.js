import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId } from '@/lib/validate.js';

export const DELETE = api(async ({ session, params }) => {
  await withRole(session, (c) => c.query('DELETE FROM wishlist_items WHERE book_id = $1', [parseId(params.bookId, 'Book')]));
  return { ok: true };
}, { roles: ['customer'] });
