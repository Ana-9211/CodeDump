import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId, objectBody, oneOf, str } from '@/lib/validate.js';

// Moderation. Each change is written to audit_log by a trigger (who, when, before/after).
export const PATCH = api(async ({ request, session, params }) => {
  const bookId = parseId(params.id, 'Book');
  const body = objectBody(await readJson(request));
  const action = oneOf(body.action, 'Action', ['approve', 'reject', 'remove']);

  let sql, args;
  if (action === 'approve') {
    sql = "UPDATE books SET status = 'approved', rejection_reason = NULL WHERE book_id = $1 AND status IN ('pending', 'rejected')";
    args = [bookId];
  } else if (action === 'reject') {
    sql = "UPDATE books SET status = 'rejected', rejection_reason = $2 WHERE book_id = $1 AND status = 'pending'";
    args = [bookId, str(body.reason, 'Reason', { max: 300 })];
  } else {
    sql = "UPDATE books SET status = 'removed' WHERE book_id = $1 AND status = 'approved'";
    args = [bookId];
  }
  const r = await withRole(session, (c) => c.query(sql, args));
  if (r.rowCount === 0) throw new HttpError(409, `That book cannot be ${action}d in its current state.`);
  return { ok: true };
}, { roles: ['admin'] });
