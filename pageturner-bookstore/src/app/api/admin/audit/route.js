import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';

export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query(
      `SELECT a.audit_id, a.table_name, a.record_id, a.action, a.old_data, a.new_data,
              u.name AS actor_name, a.changed_at
         FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
        ORDER BY a.audit_id DESC LIMIT 100`)).rows);
  return { items: rows };
}, { roles: ['admin'] });
