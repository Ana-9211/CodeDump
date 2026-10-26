import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { id as parseId } from '@/lib/validate.js';
import { parseBookInput, UPSERT_SQL, upsertParams } from '@/lib/bookInput.js';

export const PUT = api(async ({ request, session, params }) => {
  const bookId = parseId(params.id, 'Book');
  const input = parseBookInput(await readJson(request));
  await withRole(session, (c) => c.query(UPSERT_SQL, upsertParams(bookId, input)));
  return { ok: true };
}, { roles: ['seller'] });

// "Delete" = soft delete (orders keep pointing at the book)
export const DELETE = api(async ({ session, params }) => {
  const bookId = parseId(params.id, 'Book');
  await withRole(session, (c) => c.query('CALL sp_remove_book($1::bigint)', [bookId]));
  return { ok: true };
}, { roles: ['seller'] });
