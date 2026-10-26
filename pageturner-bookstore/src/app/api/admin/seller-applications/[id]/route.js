import { api, readJson } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { HttpError } from '@/lib/errors.js';
import { id as parseId, objectBody, oneOf, str } from '@/lib/validate.js';

export const PATCH = api(async ({ request, session, params }) => {
  const id = parseId(params.id, 'Application');
  const b = objectBody(await readJson(request));
  const action = oneOf(b.action, 'Action', ['approve', 'reject']);
  const note = str(b.note, 'Note', { max: 300, optional: true }) ?? null;
  if (action === 'reject' && !note) throw new HttpError(400, 'Give the applicant a reason for rejecting.');
  await withRole(session, (c) => c.query('SELECT fn_decide_seller_application($1::bigint, $2::boolean, $3)', [id, action === 'approve', note]));
  return { ok: true };
}, { roles: ['admin'] });
