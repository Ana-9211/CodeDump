import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';

// Languages that have at least one approved book (feeds the catalogue's language filter, FR-06)
export const GET = api(async ({ session }) => {
  const rows = await withRole(session, async (c) =>
    (await c.query("SELECT language, count(*)::int AS n FROM books WHERE status = 'approved' GROUP BY language ORDER BY n DESC, language")).rows);
  return { items: rows };
});
