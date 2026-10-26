import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT a.application_id, a.store_name, a.reason, a.status, a.review_note, a.created_at, a.decided_at,
              u.name AS applicant, u.email
         FROM seller_applications a JOIN users u ON u.user_id = a.user_id
        ORDER BY (a.status = 'pending') DESC, a.created_at DESC LIMIT 100`)).rows);
  return { items: rows };
}, { roles: ['admin'] });
