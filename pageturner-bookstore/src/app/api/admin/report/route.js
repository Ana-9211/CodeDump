import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { dateRange } from '@/lib/bookInput.js';

// Platform dashboard: window-function revenue series, CTE seller ranking, grouped breakdowns,
// and the recursive category tree with sub-tree totals.
export const GET = api(async ({ session, query }) => {
  const { from, to } = dateRange(query, 30);
  const data = await withRole(session, async (c) => {
    const report = (await c.query('SELECT * FROM fn_sales_report($1::date, $2::date)', [from, to])).rows;
    const sellers = (await c.query('SELECT * FROM v_seller_performance ORDER BY revenue_rank, store_name')).rows;
    const orderStatus = (await c.query('SELECT status, count(*)::int AS n FROM orders GROUP BY status ORDER BY n DESC')).rows;
    const categories = (await c.query('SELECT category_id, name, depth, subtree_books FROM fn_category_tree() ORDER BY path')).rows;
    const topBooks = (await c.query(
      `SELECT oi.title_snapshot AS title, sum(oi.quantity)::int AS units, sum(oi.line_total_cents)::int AS revenue_cents
         FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
        WHERE oi.fulfilment_status <> 'Cancelled' AND o.placed_at::date BETWEEN $1::date AND $2::date
        GROUP BY oi.book_id, oi.title_snapshot ORDER BY units DESC, title LIMIT 10`, [from, to])).rows;
    const counts = (await c.query(
      `SELECT (SELECT count(*) FROM users WHERE status = 'active')::int AS active_users,
              (SELECT count(*) FROM books WHERE status = 'approved')::int AS live_books,
              (SELECT count(*) FROM books WHERE status = 'pending')::int AS pending_books`)).rows[0];
    return { report, sellers, orderStatus, categories, topBooks, counts };
  });
  const totals = data.report.reduce((t, d) => ({ orders: t.orders + d.orders_count, units: t.units + d.units, revenue_cents: t.revenue_cents + d.revenue_cents }), { orders: 0, units: 0, revenue_cents: 0 });
  return { from, to, totals, ...data };
}, { roles: ['admin'] });
