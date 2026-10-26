import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT u.user_id, u.name, u.email, r.role_name, u.status, u.created_at
         FROM users u JOIN roles r ON r.role_id = u.role_id ORDER BY u.user_id`)).rows);
  return { items: rows };
}, { roles: ['admin'] });
