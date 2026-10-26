// Fills the shop with believable activity so dashboards and charts are not empty:
// ~16 orders spread over the last 14 days (placed through the real stored procedure),
// most of them walked through Packed -> Shipped -> Delivered, one cancelled,
// plus reviews/views in MongoDB when it is running.
//   npm run db:seed
import pg from 'pg';
import { loadEnv } from '../src/lib/env.js';
loadEnv();
const { withRole, pool } = await import('../src/lib/db.js');

const adminUrl = new URL(process.env.DATABASE_ADMIN_URL || 'postgres://postgres@127.0.0.1:5432/postgres');
adminUrl.pathname = `/${process.env.DB_NAME || 'bookstore_dbms'}`;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();

// tiny deterministic random generator so every run produces the same shop
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const users = (await admin.query("SELECT u.user_id, u.email, r.role_name AS role FROM users u JOIN roles r USING (role_id) WHERE u.email LIKE 'customer%'")).rows;
if (!users.length) { console.error('Run `npm run db:setup` first.'); process.exit(1); }
const already = (await admin.query('SELECT count(*)::int n FROM orders')).rows[0].n;
if (already > 0) { console.log(`Shop already has ${already} orders - nothing to do.`); process.exit(0); }
const books = (await admin.query("SELECT book_id FROM books WHERE status='approved' AND stock >= 8 ORDER BY book_id")).rows.map((r) => r.book_id);

const placed = [];
for (let i = 0; i < 16; i++) {
  const u = pick(users);
  const session = { userId: u.user_id, role: 'customer' };
  const orderId = await withRole(session, async (c) => {
    const { rows: [addr] } = await c.query('SELECT address_id FROM addresses ORDER BY is_default DESC LIMIT 1');
    for (const b of new Set([pick(books), pick(books)])) {
      await c.query('INSERT INTO cart_items (user_id, book_id, quantity) VALUES (app_user_id(), $1, $2) ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = EXCLUDED.quantity', [b, 1 + Math.floor(rnd() * 2)]);
    }
    const { rows: [r] } = await c.query('CALL sp_place_order($1::bigint, $2::text, NULL::bigint)', [addr.address_id, pick(['upi', 'card', 'cod'])]);
    return r.p_order_id;
  });
  placed.push({ orderId, session });
}

// backdate and progress (the superuser connection skips RLS but NOT the status-transition trigger)
const steps = ['Packed', 'Shipped', 'Delivered'];
for (const [i, o] of placed.entries()) {
  const daysAgo = Math.floor((i / placed.length) * 13) + (i % 3);
  await admin.query("UPDATE orders SET placed_at = now() - make_interval(days => $2) - make_interval(hours => $3) WHERE order_id = $1", [o.orderId, daysAgo, Math.floor(rnd() * 8)]);
  const reach = i % 5 === 4 ? 0 : i % 7 === 6 ? 1 : 3;           // some orders stay Placed or Packed
  for (const s of steps.slice(0, reach)) await admin.query('UPDATE order_items SET fulfilment_status = $2 WHERE order_id = $1', [o.orderId, s]);
}
const cancel = placed[4];                                   // index 4 never left "Placed"
await withRole(cancel.session, (c) => c.query('CALL sp_cancel_order($1::bigint)', [cancel.orderId]));
console.log(`Placed ${placed.length} orders (1 cancelled), spread over the last 2 weeks.`);

// ---- MongoDB part (optional) -------------------------------------------------
try {
  const { reviewService } = await import('../src/lib/reviews.js');
  const { closeMongo } = await import('../src/lib/mongo.js');
  const delivered = (await admin.query(
    `SELECT DISTINCT o.user_id, u.name, oi.book_id FROM order_items oi JOIN orders o USING (order_id) JOIN users u ON u.user_id = o.user_id
      WHERE oi.fulfilment_status = 'Delivered'`)).rows;
  const texts = ['Loved every chapter.', 'Solid read, would recommend.', 'Good, but a bit slow in the middle.', 'A classic for a reason.', 'Clear explanations and great examples.'];
  let n = 0;
  for (const d of delivered) {
    try {
      await reviewService.create({ bookId: d.book_id, userId: d.user_id, userName: d.name }, { rating: 3 + Math.floor(rnd() * 3), title: 'My verdict', body: pick(texts) });
      n++;
    } catch { /* already reviewed */ }
    for (let v = 0; v < 1 + Math.floor(rnd() * 6); v++) await reviewService.recordView(d.book_id, d.user_id);
  }
  console.log(`MongoDB: ${n} reviews and some page-view events created.`);
  await closeMongo();
} catch (err) {
  console.log(`MongoDB not reachable (${err.message}) - skipped reviews. Start MongoDB and run this again after \`db:reset\`.`);
}
await admin.end();
await pool.end();
