// End-to-end API tests: starts the real Next.js server and talks to it over HTTP
// as a guest, customer, seller and admin. Needs PostgreSQL (and uses MongoDB only if it is running).
// Run:  npm run build && npm test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDatabase, adminClient, PASSWORD } from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
let server, db;

class Client {
  constructor() { this.jar = new Map(); }
  async req(method, url, body, headers = {}) {
    const res = await fetch(BASE + url, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const sc of res.headers.getSetCookie()) {
      const [k, v] = sc.split(';')[0].split('=');
      if (v === '' || /max-age=0/i.test(sc)) this.jar.delete(k); else this.jar.set(k, v);
    }
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  }
  get = (u) => this.req('GET', u);
  post = (u, b = {}) => this.req('POST', u, b);
  put = (u, b) => this.req('PUT', u, b);
  patch = (u, b) => this.req('PATCH', u, b);
  del = (u) => this.req('DELETE', u);
  async login(email, password = PASSWORD) {
    const r = await this.post('/api/auth/login', { email, password });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.json)}`);
    return r.json.user;
  }
}
const as = async (email) => { const c = new Client(); c.user = await c.login(email); return c; };
const portOpen = (host, port) => new Promise((res) => { const s = net.connect({ host, port, timeout: 800 }, () => { s.destroy(); res(true); }); s.on('error', () => res(false)); s.on('timeout', () => { s.destroy(); res(false); }); });
const stockOf = async (title) => (await db.query('SELECT stock FROM books WHERE title=$1', [title])).rows[0].stock;
const bookId = async (title) => (await db.query('SELECT book_id FROM books WHERE title=$1', [title])).rows[0].book_id;

before(async () => {
  resetDatabase();
  db = await adminClient();
  if (!fs.existsSync(path.join(root, '.next/BUILD_ID'))) execFileSync('npx', ['next', 'build'], { cwd: root, stdio: 'ignore' });
  server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], { cwd: root, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'test-secret-for-api-tests-only' } });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/api/categories`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
});
after(async () => { server?.kill('SIGTERM'); await db?.end(); });

describe('authentication', () => {
  test('guests are not signed in', async () => {
    const r = await new Client().get('/api/auth/me');
    assert.deepEqual(r.json, { user: null, cartCount: 0 });
  });
  test('register validates input, signs in, and rejects duplicates', async () => {
    const c = new Client();
    assert.equal((await c.post('/api/auth/register', { name: 'Zed', email: 'zed@x.test', password: 'short1' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { name: 'Zed', email: 'zed@x.test', password: 'onlyletters' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { name: 'Zed', email: 'not-an-email', password: 'Passw0rd!' })).status, 400);
    assert.equal((await c.post('/api/auth/register', { name: 'Evil', email: 'evil@x.test', password: 'Passw0rd!', role: 'admin' })).status, 400, 'admin cannot self-register');
    assert.equal((await c.post('/api/auth/register', { name: 'Shop', email: 'shop@x.test', password: 'Passw0rd!', role: 'seller' })).status, 400, 'seller needs a store name');
    const ok = await c.post('/api/auth/register', { name: 'Zed', email: 'zed@x.test', password: 'Passw0rd!' });
    assert.equal(ok.status, 200);
    assert.equal((await c.get('/api/auth/me')).json.user.role, 'customer');
    const dup = await new Client().post('/api/auth/register', { name: 'Zed2', email: 'ZED@x.test', password: 'Passw0rd!' });
    assert.equal(dup.status, 409);
    assert.match(dup.json.error, /already exists/);
    const sel = new Client();
    assert.equal((await sel.post('/api/auth/register', { name: 'Shop', email: 'shop@x.test', password: 'Passw0rd!', role: 'seller', storeName: 'Zed Books' })).status, 200);
    assert.equal((await sel.get('/api/auth/me')).json.user.role, 'seller');
  });
  test('wrong password and unknown e-mail give the same answer (no account enumeration)', async () => {
    const a = await new Client().post('/api/auth/login', { email: 'customer1@bookstore.test', password: 'wrong-pass1' });
    const b = await new Client().post('/api/auth/login', { email: 'nobody@bookstore.test', password: 'wrong-pass1' });
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.equal(a.json.error, b.json.error);
  });
  test('five failed logins lock the account, even for the right password', async () => {
    for (let i = 0; i < 5; i++) await new Client().post('/api/auth/login', { email: 'zed@x.test', password: 'wrong-pass1' });
    const r = await new Client().post('/api/auth/login', { email: 'zed@x.test', password: 'Passw0rd!' });
    assert.equal(r.status, 429);
  });
  test('logout clears the session', async () => {
    const c = await as('customer1@bookstore.test');
    assert.equal((await c.get('/api/auth/me')).json.user.name, 'Karan Shah');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).json.user, null);
  });
  test('a forged or tampered session cookie is ignored', async () => {
    const c = new Client(); c.jar.set('bk_session', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0.');
    assert.equal((await c.get('/api/auth/me')).json.user, null);
    assert.equal((await c.get('/api/admin/users')).status, 401);
  });
});

describe('web security', () => {
  test('CSRF guards: wrong content-type and foreign origin are refused', async () => {
    const c = await as('customer1@bookstore.test');
    const form = await fetch(`${BASE}/api/cart`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: 'bookId=1&quantity=1' });
    assert.equal(form.status, 415);
    const foreign = await c.req('POST', '/api/cart', { bookId: 1, quantity: 1 }, { origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);
  });
  test('security headers are set', async () => {
    const r = await new Client().get('/api/categories');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-powered-by'), null);
  });
  test('the session cookie is HttpOnly', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer1@bookstore.test', password: PASSWORD }) });
    assert.match(res.headers.getSetCookie()[0], /HttpOnly/i);
    assert.match(res.headers.getSetCookie()[0], /SameSite=lax/i);
  });
});

describe('role gates are enforced', () => {
  test('401 for guests, 403 for the wrong role', async () => {
    const guest = new Client(), cust = await as('customer1@bookstore.test'), sel = await as('seller1@bookstore.test');
    assert.equal((await guest.get('/api/cart')).status, 401);
    assert.equal((await guest.get('/api/orders')).status, 401);
    assert.equal((await cust.get('/api/seller/books')).status, 403);
    assert.equal((await cust.get('/api/admin/users')).status, 403);
    assert.equal((await sel.get('/api/cart')).status, 403);
    assert.equal((await sel.get('/api/admin/report')).status, 403);
  });
});

describe('catalogue', () => {
  const guest = new Client();
  test('lists approved books with pagination and totals', async () => {
    const r = await guest.get('/api/books?limit=10');
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 10);
    assert.equal(r.json.total, 34);                       // 36 sample books - 1 pending - 1 rejected
    assert.equal(r.json.pages, 4);
    assert.ok(!('search_vector' in r.json.items[0]));
    const last = await guest.get('/api/books?limit=10&page=4');
    assert.equal(last.json.items.length, 4);
  });
  test('search by title, author and ISBN; full-text search by description words', async () => {
    assert.equal((await guest.get('/api/books?q=dune')).json.items[0].title, 'Dune');
    assert.equal((await guest.get('/api/books?q=Tolkien')).json.items[0].title, 'The Hobbit');
    const isbn = (await db.query("SELECT isbn FROM books WHERE title='Cosmos'")).rows[0].isbn;
    assert.equal((await guest.get(`/api/books?q=${isbn}`)).json.items[0].title, 'Cosmos');
    assert.ok((await guest.get('/api/books?q=wizard')).json.items.some((b) => /Harry Potter/.test(b.title)));
  });
  test('category filter includes sub-categories (recursive CTE)', async () => {
    const cats = (await guest.get('/api/categories')).json.items;
    const science = cats.find((c) => c.name === 'Science'), cs = cats.find((c) => c.name === 'Computer Science');
    assert.equal(science.depth, 1); assert.equal(cs.depth, 2);
    const r = await guest.get(`/api/books?category=${science.category_id}&limit=40`);
    assert.equal(r.json.total, science.subtree_books);
    assert.ok(r.json.items.some((b) => b.category_name === 'Physics') && r.json.items.some((b) => b.category_name === 'Computer Science'));
  });
  test('sorting works', async () => {
    const asc = (await guest.get('/api/books?sort=price_asc&limit=40')).json.items.map((b) => b.price_cents);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = (await guest.get('/api/books?sort=price_desc&limit=40')).json.items.map((b) => b.price_cents);
    assert.deepEqual(desc, [...asc].reverse());
    assert.equal((await guest.get('/api/books?sort=drop_table')).status, 400);
  });
  test('SQL injection attempts are inert', async () => {
    for (const q of ["'; DROP TABLE books; --", "' OR '1'='1", '%', '_', '\\']) {
      const r = await guest.get(`/api/books?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200, q);
      assert.ok(r.json.total <= 1, `${q} should not match everything`);
    }
    assert.equal((await db.query('SELECT count(*)::int n FROM books')).rows[0].n, 36);
    assert.equal((await guest.get('/api/books?category=1;DELETE FROM books')).status, 400);
    assert.equal((await guest.get('/api/books/1%20OR%201=1')).status, 400);
  });
  test('unapproved books are invisible to guests but visible to admin and the owning seller', async () => {
    const pending = await bookId('Practical PostgreSQL Tuning');
    assert.equal((await guest.get(`/api/books/${pending}`)).status, 404);
    const admin = await as('admin@bookstore.test'), owner = await as('seller2@bookstore.test'), other = await as('seller1@bookstore.test');
    assert.equal((await admin.get(`/api/books/${pending}`)).json.book.status, 'pending');
    assert.equal((await owner.get(`/api/books/${pending}`)).json.book.status, 'pending');
    assert.equal((await other.get(`/api/books/${pending}`)).status, 404);
  });
  test('book detail returns authors, category and store', async () => {
    const id = await bookId('Introduction to Algorithms');
    const b = (await guest.get(`/api/books/${id}`)).json.book;
    assert.equal(b.authors.split(', ').length, 4);
    assert.equal(b.store_name, 'Campus Corner');
  });
});

describe('customer journey: cart -> checkout -> cancel', () => {
  let cust, orderId;
  test('cart enforces stock and computes totals in SQL', async () => {
    cust = await as('customer1@bookstore.test');
    const neuro = await bookId('Neuromancer');
    const tooMany = await cust.post('/api/cart', { bookId: neuro, quantity: 5 });
    assert.equal(tooMany.status, 400); assert.match(tooMany.json.error, /only 4 copies/);
    assert.equal((await cust.post('/api/cart', { bookId: 1, quantity: 11 })).status, 400);
    const r = await cust.post('/api/cart', { bookId: await bookId('Dune'), quantity: 1 });
    assert.equal(r.status, 200);
    const again = await cust.post('/api/cart', { bookId: await bookId('Dune'), quantity: 1 });
    assert.equal(again.json.items[0].quantity, 2, 'add accumulates');
    assert.deepEqual(again.json.totals, { item_count: 2, subtotal_cents: 85800, tax_cents: 4290, shipping_cents: 0, total_cents: 90090 });
    assert.equal((await cust.get('/api/auth/me')).json.cartCount, 2);
    const set = await cust.put('/api/cart', { bookId: await bookId('Dune'), quantity: 1 });
    assert.equal(set.json.items[0].quantity, 1);
  });
  test('checkout needs a valid address; then places the order atomically', async () => {
    const dune = await bookId('Dune'); const before = await stockOf('Dune');
    assert.equal((await cust.post('/api/orders', { addressId: 999999, paymentMethod: 'card' })).status, 404);
    const addr = (await cust.get('/api/addresses')).json.items[0];
    assert.equal((await cust.post('/api/orders', { addressId: addr.address_id, paymentMethod: 'bitcoin' })).status, 400);
    const placed = await cust.post('/api/orders', { addressId: addr.address_id, paymentMethod: 'upi' });
    assert.equal(placed.status, 200, JSON.stringify(placed.json));
    orderId = placed.json.order.order_id;
    assert.match(placed.json.order.order_number, /^BK\d{6}-\d{5}$/);
    assert.equal(await stockOf('Dune'), before - 1);
    assert.equal((await cust.get('/api/cart')).json.items.length, 0, 'cart emptied');
    const empty = await cust.post('/api/orders', { addressId: addr.address_id, paymentMethod: 'upi' });
    assert.equal(empty.status, 409); assert.match(empty.json.error, /cart is empty/);
    assert.ok(dune);
  });
  test('order detail shows snapshot lines and payment; list shows the order', async () => {
    const r = (await cust.get(`/api/orders/${orderId}`)).json;
    assert.equal(r.order.status, 'Placed'); assert.equal(r.items[0].title, 'Dune'); assert.equal(r.payment.status, 'Paid');
    assert.equal(r.order.total_cents, r.order.subtotal_cents + r.order.tax_cents + r.order.shipping_cents);
    assert.ok((await cust.get('/api/orders')).json.items.some((o) => o.order_id === orderId));
  });
  test("customers cannot see each other's orders", async () => {
    const other = await as('customer2@bookstore.test');
    assert.equal((await other.get(`/api/orders/${orderId}`)).status, 404);
    assert.equal((await other.post(`/api/orders/${orderId}/cancel`)).status, 404);
    assert.equal((await other.get('/api/orders')).json.items.length, 0);
  });
  test('cancel returns the stock and refunds; a second cancel is refused', async () => {
    const before = await stockOf('Dune');
    assert.equal((await cust.post(`/api/orders/${orderId}/cancel`)).status, 200);
    assert.equal(await stockOf('Dune'), before + 1);
    const r = (await cust.get(`/api/orders/${orderId}`)).json;
    assert.equal(r.order.status, 'Cancelled'); assert.equal(r.payment.status, 'Refunded');
    assert.equal((await cust.post(`/api/orders/${orderId}/cancel`)).status, 409);
  });
  test('addresses: first is default, validation, default switching, delete', async () => {
    const c = await as('customer2@bookstore.test');
    const bad = await c.post('/api/addresses', { fullName: 'A', line1: 'x', city: 'c', state: 's', postalCode: '!!', phone: '123' });
    assert.equal(bad.status, 400);
    const a2 = await c.post('/api/addresses', { label: 'Work', fullName: 'Meera Iyer', line1: '5 Office Park', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600001', phone: '9876500000', isDefault: true });
    assert.equal(a2.status, 200);
    const list = (await c.get('/api/addresses')).json.items;
    assert.equal(list.filter((a) => a.is_default).length, 1);
    assert.equal(list[0].label, 'Work');
    const home = list.find((a) => a.label === 'Home');
    assert.equal((await c.patch(`/api/addresses/${home.address_id}`, {})).status, 200);
    assert.equal((await c.get('/api/addresses')).json.items[0].label, 'Home');
    assert.equal((await c.del(`/api/addresses/${a2.json.addressId}`)).status, 200);
    assert.equal((await c.del(`/api/addresses/${a2.json.addressId}`)).status, 404);
  });
});

describe('seller and admin journey', () => {
  let newBook, orderItemId, buyer, owner, admin, rival;
  test('seller creates a listing; it is pending and hidden until an admin approves it', async () => {
    owner = await as('seller2@bookstore.test'); admin = await as('admin@bookstore.test'); rival = await as('seller1@bookstore.test');
    const cat = (await new Client().get('/api/categories')).json.items.find((c) => c.name === 'Computer Science').category_id;
    const bad = await owner.post('/api/seller/books', { title: 'T', isbn: 'bad', categoryId: cat, price: 499, stock: 3, authors: 'A' });
    assert.equal(bad.status, 400);
    const neg = await owner.post('/api/seller/books', { title: 'Free Book', isbn: '9781234567897', categoryId: cat, price: -5, stock: 3, authors: 'A' });
    assert.equal(neg.status, 400);
    const made = await owner.post('/api/seller/books', { title: 'Seven Databases', isbn: '978-1-93435-692-0', categoryId: cat, price: '599.50', stock: 6, authors: 'Eric Redmond, Jim Wilson', description: 'A tour of databases' });
    assert.equal(made.status, 200, JSON.stringify(made.json));
    newBook = made.json.bookId;
    const dup = await owner.post('/api/seller/books', { title: 'Dup', isbn: '9781934356920', categoryId: cat, price: 100, stock: 1, authors: 'X' });
    assert.equal(dup.status, 409); assert.match(dup.json.error, /already have a book with this ISBN/);
    assert.equal((await new Client().get(`/api/books/${newBook}`)).status, 404);
    assert.equal((await new Client().get('/api/books?q=seven databases')).json.total, 0);
    assert.ok((await admin.get('/api/admin/books?status=pending')).json.items.some((b) => b.book_id === newBook));
    assert.equal((await owner.get('/api/seller/books')).json.items.find((b) => b.book_id === newBook).price_cents, 59950);
  });
  test('admin moderation: reject needs a reason, resubmission, approve', async () => {
    assert.equal((await admin.patch(`/api/admin/books/${newBook}`, { action: 'reject' })).status, 400);
    assert.equal((await admin.patch(`/api/admin/books/${newBook}`, { action: 'reject', reason: 'Cover image missing' })).status, 200);
    assert.equal((await owner.get('/api/seller/books')).json.items.find((b) => b.book_id === newBook).rejection_reason, 'Cover image missing');
    assert.equal((await admin.patch(`/api/admin/books/${newBook}`, { action: 'approve' })).status, 200);
    assert.equal((await new Client().get(`/api/books/${newBook}`)).json.book.title, 'Seven Databases');
    assert.equal((await admin.patch(`/api/admin/books/${newBook}`, { action: 'approve' })).status, 409, 'already approved');
  });
  test("a seller cannot edit or remove another seller's listing", async () => {
    const payload = { title: 'Hijacked', isbn: '9781934356920', categoryId: 1, price: 1, stock: 1, authors: 'x' };
    const r = await rival.put(`/api/seller/books/${newBook}`, payload);
    assert.equal(r.status, 404);
    assert.equal((await rival.del(`/api/seller/books/${newBook}`)).status, 404);
    assert.equal((await new Client().get(`/api/books/${newBook}`)).json.book.title, 'Seven Databases');
  });
  test('seller edits stock/price; restock is logged in the stock ledger', async () => {
    const r = await owner.put(`/api/seller/books/${newBook}`, { title: 'Seven Databases', isbn: '9781934356920', categoryId: (await owner.get('/api/seller/books')).json.items.find((b) => b.book_id === newBook).category_id, price: 549, stock: 20, authors: ['Eric Redmond', 'Jim Wilson'] });
    assert.equal(r.status, 200);
    assert.equal(await stockOf('Seven Databases'), 20);
    const mv = (await db.query('SELECT delta, reason FROM stock_movements WHERE book_id=$1 ORDER BY movement_id', [newBook])).rows;
    assert.deepEqual(mv, [{ delta: 6, reason: 'restock' }, { delta: 14, reason: 'restock' }]);
  });
  test('fulfilment: customer buys, seller ships, order status rolls up, wrong seller is blocked', async () => {
    buyer = await as('customer1@bookstore.test');
    await buyer.post('/api/cart', { bookId: newBook, quantity: 2 });
    const addr = (await buyer.get('/api/addresses')).json.items[0];
    const o = (await buyer.post('/api/orders', { addressId: addr.address_id, paymentMethod: 'cod' })).json.order;
    const lines = (await owner.get('/api/seller/orders')).json.items;
    const line = lines.find((l) => l.order_number === o.order_number);
    assert.ok(line, 'seller sees the line'); assert.equal(line.ship_city, 'Bengaluru');
    orderItemId = line.order_item_id;
    assert.equal((await rival.get('/api/seller/orders')).json.items.find((l) => l.order_number === o.order_number), undefined, 'rival sees nothing');
    assert.equal((await rival.patch(`/api/seller/order-items/${orderItemId}`, { status: 'Packed' })).status, 404);
    assert.equal((await owner.patch(`/api/seller/order-items/${orderItemId}`, { status: 'Delivered' })).status, 409, 'cannot skip Packed/Shipped');
    assert.equal((await owner.patch(`/api/seller/order-items/${orderItemId}`, { status: 'Packed' })).status, 200);
    assert.equal((await buyer.get(`/api/orders/${o.order_id}`)).json.order.status, 'InProgress');
    const noCancel = await buyer.post(`/api/orders/${o.order_id}/cancel`);
    assert.equal(noCancel.status, 200, 'Packed (not shipped) can still be cancelled');
    assert.equal((await buyer.get(`/api/orders/${o.order_id}`)).json.order.status, 'Cancelled');
    // second order, shipped this time
    await buyer.post('/api/cart', { bookId: newBook, quantity: 1 });
    const o2 = (await buyer.post('/api/orders', { addressId: addr.address_id, paymentMethod: 'card' })).json.order;
    const l2 = (await owner.get('/api/seller/orders')).json.items.find((l) => l.order_number === o2.order_number);
    await owner.patch(`/api/seller/order-items/${l2.order_item_id}`, { status: 'Packed' });
    await owner.patch(`/api/seller/order-items/${l2.order_item_id}`, { status: 'Shipped' });
    const blocked = await buyer.post(`/api/orders/${o2.order_id}/cancel`);
    assert.equal(blocked.status, 409); assert.match(blocked.json.error, /already shipped/);
    await owner.patch(`/api/seller/order-items/${l2.order_item_id}`, { status: 'Delivered' });
    assert.equal((await buyer.get(`/api/orders/${o2.order_id}`)).json.order.status, 'Delivered');
  });
  test('reports: seller sees own totals, admin sees everything', async () => {
    const s = (await owner.get('/api/seller/report')).json;
    assert.equal(s.totals.orders, 1); assert.equal(s.totals.units, 1);                // only the non-cancelled order
    assert.equal(s.totals.revenue_cents, 54900);
    assert.ok(s.report.length === 14 && s.report.at(-1).running_revenue_cents === 54900);
    const rv = (await rival.get('/api/seller/report')).json;
    assert.equal(rv.totals.revenue_cents, 0, 'rival sees none of it');
    const a = (await admin.get('/api/admin/report')).json;
    assert.ok(a.totals.revenue_cents >= 54900);
    assert.equal(a.sellers[0].revenue_rank, 1); assert.equal(a.counts.pending_books, 1);
    assert.ok(a.categories.some((c) => c.name === 'Science' && c.depth === 1));
    assert.equal((await owner.get('/api/seller/report?from=2026-12-31&to=2026-01-01')).status, 400);
    assert.equal((await owner.get('/api/seller/report?from=abc')).status, 400);
  });
  test('admin suspends a customer: their session dies immediately; reactivation restores access', async () => {
    const victim = await as('customer2@bookstore.test');
    const uid = victim.user.userId;
    assert.equal((await victim.get('/api/cart')).status, 200);
    assert.equal((await admin.patch(`/api/admin/users/${uid}`, { status: 'suspended' })).status, 200);
    assert.equal((await victim.get('/api/cart')).status, 401, 'old cookie no longer works');
    const login = await new Client().post('/api/auth/login', { email: 'customer2@bookstore.test', password: PASSWORD });
    assert.equal(login.status, 403);
    assert.equal((await admin.patch(`/api/admin/users/${uid}`, { status: 'active' })).status, 200);
    assert.equal((await victim.get('/api/cart')).status, 200);
  });
  test('admins cannot suspend themselves or other admins', async () => {
    assert.equal((await admin.patch(`/api/admin/users/${admin.user.userId}`, { status: 'suspended' })).status, 409);
    const users = (await admin.get('/api/admin/users')).json.items;
    assert.ok(users.length >= 5 && users.every((u) => !('password_hash' in u)));
  });
  test('audit log recorded the moderation and suspension events', async () => {
    const log = (await admin.get('/api/admin/audit')).json.items;
    assert.ok(log.some((l) => l.table_name === 'books' && l.new_data.status === 'rejected' && l.actor_name === 'Asha Admin'));
    assert.ok(log.some((l) => l.table_name === 'users' && l.new_data.status === 'suspended'));
    assert.ok(!JSON.stringify(log).includes('password_hash'));
  });
  test('admin settings: changing the tax rate changes cart totals (data-driven rules)', async () => {
    assert.equal((await admin.patch('/api/admin/settings', { key: 'tax_rate_percent', value: 150 })).status, 400);
    assert.equal((await admin.patch('/api/admin/settings', { key: 'tax_rate_percent', value: 18 })).status, 200);
    await buyer.post('/api/cart', { bookId: await bookId('Dune'), quantity: 1 });
    assert.equal((await buyer.get('/api/cart')).json.totals.tax_cents, Math.round(42900 * 0.18));
    await buyer.del(`/api/cart/${await bookId('Dune')}`);
    assert.equal((await admin.patch('/api/admin/settings', { key: 'tax_rate_percent', value: 5 })).status, 200);
    assert.equal((await buyer.patch('/api/admin/settings', { key: 'tax_rate_percent', value: 0 })).status, 403);
  });
  test('seller removes a listing (soft delete); it leaves the catalogue and carts', async () => {
    await buyer.post('/api/cart', { bookId: newBook, quantity: 1 });
    assert.equal((await owner.del(`/api/seller/books/${newBook}`)).status, 200);
    assert.equal((await new Client().get(`/api/books/${newBook}`)).status, 404);
    assert.equal((await buyer.get('/api/cart')).json.items.length, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM order_items WHERE book_id=$1', [newBook])).rows[0].n, 2, 'order history intact (cancelled + delivered lines)');
  });
});

describe('MongoDB features over HTTP', async () => {
  const mongoUp = await portOpen('127.0.0.1', 27017);

  test('without MongoDB the shop keeps working and reviews report 503', { skip: mongoUp }, async () => {
    const guest = new Client();
    const id = await bookId('Dune');
    assert.equal((await guest.get(`/api/books/${id}`)).status, 200, 'book page unaffected');
    assert.deepEqual((await guest.get('/api/trending')).json, { items: [] });
    const r = await guest.get(`/api/books/${id}/reviews`);
    assert.equal(r.status, 503); assert.match(r.json.error, /temporarily unavailable/);
  });

  describe('with MongoDB running', { skip: !mongoUp }, () => {
    test('verified-purchase review lifecycle: create, read, update, vote, delete', async () => {
      const id = await bookId('The Hobbit');
      const cust = await as('customer1@bookstore.test'), other = await as('customer2@bookstore.test'), admin = await as('admin@bookstore.test');
      assert.equal((await cust.post(`/api/books/${id}/reviews`, { rating: 5, body: 'Lovely' })).status, 403, 'not bought yet');
      await cust.post('/api/cart', { bookId: id, quantity: 1 });
      const addr = (await cust.get('/api/addresses')).json.items[0];
      await cust.post('/api/orders', { addressId: addr.address_id, paymentMethod: 'card' });
      const made = await cust.post(`/api/books/${id}/reviews`, { rating: 5, title: 'Classic', body: 'There and back again.' });
      assert.equal(made.status, 200, JSON.stringify(made.json));
      assert.equal((await cust.post(`/api/books/${id}/reviews`, { rating: 1, body: 'again' })).status, 409);
      let list = (await other.get(`/api/books/${id}/reviews`)).json;
      assert.equal(list.summary.count, 1); assert.equal(list.items[0].mine, false);
      const reviewId = made.json.review.id;
      assert.equal((await other.patch(`/api/reviews/${reviewId}`, { rating: 1 })).status, 404);
      assert.equal((await cust.patch(`/api/reviews/${reviewId}`, { rating: 4 })).json.summary.average, 4);
      assert.equal((await other.post(`/api/reviews/${reviewId}/helpful`)).json.review.helpfulCount, 1);
      assert.equal((await db.query("SELECT avg_rating, review_count FROM books WHERE book_id=$1", [id])).rows[0].review_count, 1);
      assert.equal((await other.del(`/api/reviews/${reviewId}`)).status, 404);
      assert.equal((await admin.del(`/api/reviews/${reviewId}`)).status, 200);
      list = (await cust.get(`/api/books/${id}/reviews`)).json;
      assert.equal(list.summary.count, 0);
    });
  });
});

describe('features merged from the SE backlog', () => {
  let originalHashes;
  before(async () => { originalHashes = (await db.query("SELECT email, password_hash FROM users WHERE email LIKE 'customer%'")).rows; });
  const restorePasswords = async () => { for (const r of originalHashes) await db.query('UPDATE users SET password_hash=$2, failed_login_count=0, locked_until=NULL WHERE email=$1', [r.email, r.password_hash]); };
  test('FR-03 password reset: generic reply, one-time 30-minute token, old password stops working', async () => {
    const c = new Client();
    const unknown = await c.post('/api/auth/forgot', { email: 'nobody@x.test' });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.json.devResetLink, undefined, 'no link for unknown e-mail (and same message)');
    const known = await c.post('/api/auth/forgot', { email: 'customer2@bookstore.test' });
    assert.equal(known.json.message, unknown.json.message);
    // production mode hides the link, so read the token hash path through the DB instead
    const row = (await db.query("SELECT token_hash, expires_at FROM password_resets ORDER BY created_at DESC LIMIT 1")).rows[0];
    assert.ok(row.token_hash.length === 64);
    assert.equal((await c.post('/api/auth/reset', { token: 'a'.repeat(64), password: 'NewPassw0rd!' })).status, 400, 'unknown token rejected');
    // the raw token is not stored, so create a known one the same way the route does
    const crypto = await import('node:crypto');
    const token = crypto.randomBytes(32).toString('hex');
    await db.query("SELECT * FROM fn_create_password_reset('customer2@bookstore.test', $1)", [crypto.createHash('sha256').update(token).digest('hex')]);
    assert.equal((await c.post('/api/auth/reset', { token, password: 'weak' })).status, 400);
    assert.equal((await c.post('/api/auth/reset', { token, password: 'NewPassw0rd!' })).status, 200);
    assert.equal((await c.post('/api/auth/reset', { token, password: 'Another1Pass' })).status, 400, 'token works once');
    assert.equal((await c.post('/api/auth/login', { email: 'customer2@bookstore.test', password: PASSWORD })).status, 401);
    assert.equal((await c.post('/api/auth/login', { email: 'customer2@bookstore.test', password: 'NewPassw0rd!' })).status, 200);
    await restorePasswords();
  });

  test('FR-18 profile + password change; address limit of 5', async () => {
    const c = await as('customer1@bookstore.test');
    assert.equal((await c.patch('/api/account', { name: 'Karan S', phone: '9988776655' })).status, 200);
    assert.equal((await c.get('/api/account')).json.account.name, 'Karan S');
    assert.equal((await c.patch('/api/account', { name: 'K', phone: 'abc' })).status, 400, 'phone check constraint');
    assert.equal((await c.post('/api/account/password', { currentPassword: 'wrong', newPassword: 'Passw0rd!2' })).status, 400);
    assert.equal((await c.post('/api/account/password', { currentPassword: PASSWORD, newPassword: 'Passw0rd!2' })).status, 200);
    assert.equal((await new Client().post('/api/auth/login', { email: 'customer1@bookstore.test', password: 'Passw0rd!2' })).status, 200);
    await restorePasswords();
    const addr = { fullName: 'A', line1: 'x', city: 'c', state: 's', postalCode: '560001', phone: '9876543210' };
    let last;
    for (let i = 0; i < 5; i++) last = await c.post('/api/addresses', addr);
    assert.equal(last.status, 400, 'a 6th address is refused by the trigger');
    assert.match(last.json.error, /at most 5/);
  });

  test('FR-10 wishlist is private to the customer and idempotent', async () => {
    const c = await as('customer2@bookstore.test'), other = await as('customer1@bookstore.test');
    const id = await bookId('Dune');
    assert.equal((await c.post('/api/wishlist', { bookId: id })).status, 200);
    assert.equal((await c.post('/api/wishlist', { bookId: id })).status, 200);
    assert.equal((await c.get('/api/wishlist')).json.items.length, 1);
    assert.equal((await other.get('/api/wishlist')).json.items.length, 0);
    assert.equal((await new Client().get('/api/wishlist')).status, 401);
    assert.equal((await c.del(`/api/wishlist/${id}`)).status, 200);
    assert.equal((await c.get('/api/wishlist')).json.items.length, 0);
  });

  test('FR-19/25 seller application: apply, admin approves, role changes, notification arrives', async () => {
    const u = new Client();
    await u.post('/api/auth/register', { name: 'Newbie', email: 'newbie@x.test', password: 'Passw0rd!' });
    const admin = await as('admin@bookstore.test');
    assert.equal((await u.post('/api/seller-application', { storeName: 'Page Turner Books' })).status, 409, 'store name taken');
    const made = await u.post('/api/seller-application', { storeName: 'Newbie Reads', reason: 'I love books' });
    assert.equal(made.status, 200);
    assert.equal((await u.post('/api/seller-application', { storeName: 'Newbie Two' })).status, 409, 'only one pending');
    assert.equal((await u.get('/api/seller/books')).status, 403, 'still a customer');
    assert.equal((await u.patch(`/api/admin/seller-applications/${made.json.applicationId}`, { action: 'approve' })).status, 403);
    assert.equal((await admin.patch(`/api/admin/seller-applications/${made.json.applicationId}`, { action: 'reject' })).status, 400, 'rejection needs a reason');
    assert.equal((await admin.patch(`/api/admin/seller-applications/${made.json.applicationId}`, { action: 'approve' })).status, 200);
    assert.equal((await admin.patch(`/api/admin/seller-applications/${made.json.applicationId}`, { action: 'approve' })).status, 404, 'already decided');
    assert.equal((await u.get('/api/seller/books')).status, 200, 'now a seller (role re-read from the DB)');
    const notes = (await u.get('/api/notifications')).json;
    assert.ok(notes.items.some((n) => n.kind === 'seller_approved'));
    assert.ok((await db.query("SELECT 1 FROM audit_log WHERE table_name='seller_applications'")).rowCount >= 1);
  });

  test('FR-14 notifications: order placed/cancelled create rows; read state is per user', async () => {
    const c = await as('customer2@bookstore.test');
    await c.post('/api/cart', { bookId: await bookId('Dune'), quantity: 1 });
    const addr = (await c.get('/api/addresses')).json.items[0].address_id;
    const o = (await c.post('/api/orders', { addressId: addr, paymentMethod: 'cod' })).json.order;
    let n = (await c.get('/api/notifications')).json;
    assert.ok(n.items.some((x) => x.kind === 'order_placed' && x.link === `/orders/${o.order_id}`));
    assert.ok(n.unread >= 1);
    await c.post(`/api/orders/${o.order_id}/cancel`);
    n = (await c.get('/api/notifications')).json;
    assert.ok(n.items.some((x) => x.kind === 'order_status' && /Cancelled/.test(x.subject)));
    await c.post('/api/notifications', {});
    assert.equal((await c.get('/api/notifications')).json.unread, 0);
    assert.equal((await (await as('customer1@bookstore.test')).get('/api/notifications')).json.items.every((x) => x.user_id === undefined), true);
  });

  test('FR-26 admin manages categories; guards prevent breaking the tree', async () => {
    const admin = await as('admin@bookstore.test'), seller = await as('seller1@bookstore.test');
    assert.equal((await seller.post('/api/admin/categories', { name: 'Hack' })).status, 403);
    const made = await admin.post('/api/admin/categories', { name: 'Poetry' });
    assert.equal(made.status, 200);
    assert.equal((await admin.post('/api/admin/categories', { name: 'Poetry' })).status, 409, 'duplicate root name');
    assert.equal((await admin.patch(`/api/admin/categories/${made.json.categoryId}`, { name: 'Verse' })).status, 200);
    const fiction = (await db.query("SELECT category_id FROM categories WHERE name='Fiction'")).rows[0].category_id;
    const del = await admin.del(`/api/admin/categories/${fiction}`);
    assert.equal(del.status, 409); assert.match(del.json.error, /sub-categories|books/);
    assert.equal((await admin.del(`/api/admin/categories/${made.json.categoryId}`)).status, 200);
  });

  test('FR-06 price and rating filters', async () => {
    const all = (await new Client().get('/api/books?limit=40')).json;
    const cheap = (await new Client().get('/api/books?limit=40&maxPrice=300')).json;
    assert.ok(cheap.total > 0 && cheap.total < all.total);
    assert.ok(cheap.items.every((b) => b.price_cents <= 30000));
    const mid = (await new Client().get('/api/books?limit=40&minPrice=300&maxPrice=500')).json;
    assert.ok(mid.items.every((b) => b.price_cents >= 30000 && b.price_cents <= 50000));
    assert.equal((await new Client().get('/api/books?minRating=9')).status, 400);
    assert.equal((await new Client().get("/api/books?minPrice=1;DROP TABLE books")).status, 400);
  });
});
