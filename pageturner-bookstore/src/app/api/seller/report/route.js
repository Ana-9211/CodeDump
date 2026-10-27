import { api } from '@/lib/http.js';
import { withRole } from '@/lib/db.js';
import { dateRange } from '@/lib/bookInput.js';

// Same SQL function the admin uses (fn_sales_report); row level security makes it
// return only THIS seller's sales.
export const GET = api(async ({ session, query }) => {
  const { from, to } = dateRange(query);
  const data = await withRole(session, async (c) => {
    const report = (await c.query('SELECT * FROM fn_sales_report($1::date, $2::date)', [from, to])).rows;
    const lowStock = (await c.query('SELECT * FROM v_low_stock ORDER BY stock, title')).rows;
    const topBooks = (await c.query(
      `SELECT oi.book_id, oi.title_snapshot AS title, sum(oi.quantity)::int AS units, sum(oi.line_total_cents)::int AS revenue_cents
         FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
        WHERE oi.fulfilment_status <> 'Cancelled' AND o.placed_at::date BETWEEN $1::date AND $2::date
        GROUP BY oi.book_id, oi.title_snapshot ORDER BY units DESC, title LIMIT 10`, [from, to])).rows;
    return { report, lowStock, topBooks };
  });
  const totals = data.report.reduce((t, d) => ({ orders: t.orders + d.orders_count, units: t.units + d.units, revenue_cents: t.revenue_cents + d.revenue_cents }), { orders: 0, units: 0, revenue_cents: 0 });
  return { from, to, totals, ...data };
}, { roles: ['seller'] });
