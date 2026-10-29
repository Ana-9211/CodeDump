// Database-level tests: constraints, procedures, triggers, concurrency and RBAC.
// Run:  npm test      (rebuilds the SQL database first, so it is safe to repeat)
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, adminClient } from './helpers.mjs';
import { withRole, pool, asApp } from '../src/lib/db.js';

let admin;                 // superuser connection for arranging/inspecting
const U = {};              // email -> { userId, role }

const as = (email, fn) => withRole(U[email], fn);
const code = (c) => (e) => e.code === c || (console.error('expected', c, 'got', e.code, e.message), false);
const bookByTitle = async (t) => (await admin.query('SELECT * FROM books WHERE title = $1', [t])).rows[0];
const addrOf = async (email) => (await admin.query('SELECT address_id FROM addresses WHERE user_id = $1', [U[email].userId])).rows[0].address_id;
const addToCart = (email, bookId, qty) =>
  as(email, (c) => c.query('INSERT INTO cart_items (user_id, book_id, quantity) VALUES (app_user_id(), $1, $2) ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = EXCLUDED.quantity', [bookId, qty]));
const place = (email, method = 'card') =>
  addrOf(email).then((a) => as(email, (c) => c.query('CALL sp_place_order($1::bigint, $2::text, NULL::bigint)', [a, method])).then((r) => r.rows[0].p_order_id));

before(async () => {
  resetDatabase();
  admin = await adminClient();
  const { rows } = await admin.query('SELECT u.user_id, u.email, r.role_name FROM users u JOIN roles r USING (role_id)');
  for (const r of rows) U[r.email] = { userId: r.user_id, role: r.role_name };
});
after(async () => { await admin.end(); await pool.end(); });

describe('1. constraints keep bad data out (even for a superuser)', () => {
  test('price must be positive', async () => {
    await assert.rejects(admin.query("UPDATE books SET price_cents = 0 WHERE title = 'Coraline'"), code('23514'));
  });
  test('stock cannot go negative', async () => {
    await assert.rejects(admin.query("UPDATE books SET stock = -1 WHERE title = 'Coraline'"), code('23514'));
  });
  test('e-mail must be unique, case-insensitively', async () => {
    await assert.rejects(
      admin.query("INSERT INTO users (name,email,password_hash,role_id) VALUES ('x','CUSTOMER1@bookstore.test','h',1)"), code('23505'));
  });
  test('ISBN format is enforced', async () => {
    await assert.rejects(admin.query("UPDATE books SET isbn = 'abc' WHERE title = 'Coraline'"), code('23514'));
  });
  test('order total must equal subtotal + tax + shipping', async () => {
    await assert.rejects(admin.query(`INSERT INTO orders (user_id, ship_full_name, ship_line1, ship_city, ship_state, ship_postal_code, ship_country, ship_phone,
       subtotal_cents, tax_cents, shipping_cents, total_cents) VALUES (${U['customer1@bookstore.test'].userId},'a','b','c','d','560001','India','9999999',100,5,0,999)`), code('23514'));
  });
  test('only one default address per user (partial unique index)', async () => {
    await assert.rejects(admin.query(`INSERT INTO addresses (user_id, full_name, line1, city, state, postal_code, phone, is_default)
       VALUES (${U['customer1@bookstore.test'].userId}, 'a','b','c','d','560001','9999999', true)`), code('23505'));
  });
  test('a category cannot be its own parent; root names are unique', async () => {
    await assert.rejects(admin.query('UPDATE categories SET parent_id = category_id WHERE name = $1', ['Wonderlands']), code('23514'));
    await assert.rejects(admin.query("INSERT INTO categories (name, parent_id) VALUES ('Portal Worlds', NULL)"), code('23505'));
  });
  test('a customer cannot own books (trigger)', async () => {
    const cat = (await admin.query("SELECT category_id FROM categories WHERE name='Wonderlands'")).rows[0].category_id;
    await assert.rejects(admin.query(`INSERT INTO books (seller_id, category_id, isbn, title, price_cents, stock)
       VALUES (${U['customer1@bookstore.test'].userId}, ${cat}, '9780000000002', 'Nope', 100, 1)`), code('23514'));
  });
  test('a rejected book needs a reason', async () => {
    await assert.rejects(admin.query("UPDATE books SET status='rejected', rejection_reason = NULL WHERE title = 'Coraline'"), code('23514'));
  });
});

describe('2. cart rules and checkout procedure', () => {
  test('cart quantity cannot exceed stock (trigger)', async () => {
    const neuro = await bookByTitle('The Last Unicorn');                 // only 4 in stock
    await assert.rejects(addToCart('customer1@bookstore.test', neuro.book_id, 5), /only 4 copies of "The Last Unicorn" in stock/);
    await assert.rejects(addToCart('customer1@bookstore.test', (await bookByTitle('Quick Spells for Busy Wizards')).book_id, 1), code('55000')); // not approved
  });

  test('fn_cart_totals applies tax and the free-shipping threshold', async () => {
    const hobbit = await bookByTitle('The Hobbit');           // 349.00
    await addToCart('customer1@bookstore.test', hobbit.book_id, 1);
    let t = (await as('customer1@bookstore.test', (c) => c.query('SELECT * FROM fn_cart_totals()'))).rows[0];
    assert.deepEqual(t, { item_count: 1, subtotal_cents: 34900, tax_cents: 1745, shipping_cents: 4900, total_cents: 41545 });
    await addToCart('customer1@bookstore.test', hobbit.book_id, 2);   // 698.00 >= 499.00 -> free shipping
    t = (await as('customer1@bookstore.test', (c) => c.query('SELECT * FROM fn_cart_totals()'))).rows[0];
    assert.equal(t.shipping_cents, 0);
    assert.equal(t.total_cents, 69800 + 3490);
  });

  test('sp_place_order creates order, items, payment, deducts stock, logs movement, empties cart', async () => {
    const hobbit = await bookByTitle('The Hobbit');          // cart already holds 2
    const stockBefore = hobbit.stock;
    const orderId = await place('customer1@bookstore.test', 'upi');
    const o = (await admin.query('SELECT * FROM orders WHERE order_id=$1', [orderId])).rows[0];
    assert.equal(o.status, 'Placed');
    assert.equal(o.total_cents, o.subtotal_cents + o.tax_cents + o.shipping_cents);
    assert.match(o.order_number, /^BK\d{6}-\d{5}$/);
    assert.equal((await bookByTitle('The Hobbit')).stock, stockBefore - 2);
    assert.equal((await admin.query('SELECT count(*)::int n FROM cart_items WHERE user_id=$1', [U['customer1@bookstore.test'].userId])).rows[0].n, 0);
    const pay = (await admin.query('SELECT * FROM payments WHERE order_id=$1', [orderId])).rows[0];
    assert.equal(pay.status, 'Paid'); assert.equal(pay.amount_cents, o.total_cents);
    const mv = (await admin.query("SELECT delta FROM stock_movements WHERE reason='order' AND book_id=$1", [hobbit.book_id])).rows;
    assert.deepEqual(mv.map((m) => m.delta), [-2]);
    // snapshot: later price change must not rewrite history
    await admin.query("UPDATE books SET price_cents = 99900 WHERE title='The Hobbit'");
    const item = (await admin.query('SELECT unit_price_cents, title_snapshot FROM order_items WHERE order_id=$1', [orderId])).rows[0];
    assert.equal(item.unit_price_cents, 34900); assert.equal(item.title_snapshot, 'The Hobbit');
    await admin.query("UPDATE books SET price_cents = 34900 WHERE title='The Hobbit'");
  });

  test('empty cart and foreign address are rejected', async () => {
    await assert.rejects(place('customer2@bookstore.test'), /cart is empty/);
    await addToCart('customer2@bookstore.test', (await bookByTitle('Coraline')).book_id, 1);
    const otherAddr = await addrOf('customer1@bookstore.test');
    await assert.rejects(
      as('customer2@bookstore.test', (c) => c.query('CALL sp_place_order($1::bigint,$2::text,NULL::bigint)', [otherAddr, 'card'])), code('P0002'));
  });

  test('a failing line rolls the WHOLE order back (atomicity)', async () => {
    // customer2 cart: Coraline (ok) + The Last Unicorn x3 ; then someone else buys 2 of The Last Unicorn first
    const neuro = await bookByTitle('The Last Unicorn');          // stock 4
    await addToCart('customer2@bookstore.test', neuro.book_id, 3);
    await admin.query('UPDATE books SET stock = 2 WHERE book_id = $1', [neuro.book_id]);   // stock vanished meanwhile
    const stardustBefore = (await bookByTitle('Coraline')).stock;
    const ordersBefore = (await admin.query('SELECT count(*)::int n FROM orders')).rows[0].n;
    await assert.rejects(place('customer2@bookstore.test'), /only 2 copies of "The Last Unicorn"/);
    assert.equal((await bookByTitle('Coraline')).stock, stardustBefore, 'Coraline stock untouched');
    assert.equal((await admin.query('SELECT count(*)::int n FROM orders')).rows[0].n, ordersBefore, 'no partial order');
    assert.equal((await admin.query('SELECT count(*)::int n FROM cart_items WHERE user_id=$1', [U['customer2@bookstore.test'].userId])).rows[0].n, 2, 'cart kept');
    await admin.query('DELETE FROM cart_items WHERE user_id = $1', [U['customer2@bookstore.test'].userId]);
    await admin.query('UPDATE books SET stock = 4 WHERE book_id = $1', [neuro.book_id]);
  });

  test('two customers racing for the last copy: exactly one wins (row locks)', async () => {
    const book = await bookByTitle('Redwall');
    await admin.query('UPDATE books SET stock = 1 WHERE book_id = $1', [book.book_id]);
    await addToCart('customer1@bookstore.test', book.book_id, 1);
    await addToCart('customer2@bookstore.test', book.book_id, 1);
    const results = await Promise.allSettled([place('customer1@bookstore.test'), place('customer2@bookstore.test')]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    assert.equal(ok, 1, 'exactly one order succeeds');
    assert.equal((await bookByTitle('Redwall')).stock, 0, 'stock is 0, never negative');
    await admin.query('DELETE FROM cart_items');
    await admin.query('UPDATE books SET stock = 15 WHERE book_id = $1', [book.book_id]);
  });
});

describe('3. fulfilment workflow, cancellation and audit triggers', () => {
  let orderId, itemId, stardust;
  test('seller advances status; illegal jumps are blocked; order status rolls up', async () => {
    stardust = await bookByTitle('Coraline');
    await addToCart('customer1@bookstore.test', stardust.book_id, 2);
    orderId = await place('customer1@bookstore.test', 'cod');
    itemId = (await admin.query('SELECT order_item_id FROM order_items WHERE order_id=$1', [orderId])).rows[0].order_item_id;
    const set = (status) => as('seller1@bookstore.test', (c) => c.query('UPDATE order_items SET fulfilment_status=$2 WHERE order_item_id=$1', [itemId, status]));

    await assert.rejects(set('Delivered'), /illegal status change Placed -> Delivered/);
    await set('Packed');
    assert.equal((await admin.query('SELECT status FROM orders WHERE order_id=$1', [orderId])).rows[0].status, 'InProgress');
    await set('Shipped'); await set('Delivered');
    assert.equal((await admin.query('SELECT status FROM orders WHERE order_id=$1', [orderId])).rows[0].status, 'Delivered');
    await assert.rejects(set('Placed'), /illegal status change/);
  });

  test("another seller cannot touch someone else's order line (RLS)", async () => {
    const r = await as('seller2@bookstore.test', (c) => c.query("UPDATE order_items SET fulfilment_status='Cancelled' WHERE order_item_id=$1", [itemId]));
    assert.equal(r.rowCount, 0);
  });

  test('cancel restores stock, refunds payment, rolls order up; shipped orders cannot be cancelled', async () => {
    const before = (await bookByTitle('Coraline')).stock;
    await addToCart('customer1@bookstore.test', stardust.book_id, 3);
    const id2 = await place('customer1@bookstore.test', 'card');
    assert.equal((await bookByTitle('Coraline')).stock, before - 3);
    await as('customer1@bookstore.test', (c) => c.query('CALL sp_cancel_order($1::bigint)', [id2]));
    assert.equal((await bookByTitle('Coraline')).stock, before, 'stock returned');
    const o = (await admin.query('SELECT status, cancelled_at FROM orders WHERE order_id=$1', [id2])).rows[0];
    assert.equal(o.status, 'Cancelled'); assert.ok(o.cancelled_at);
    assert.equal((await admin.query('SELECT status FROM payments WHERE order_id=$1', [id2])).rows[0].status, 'Refunded');
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('CALL sp_cancel_order($1::bigint)', [id2])), /already cancelled/);
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('CALL sp_cancel_order($1::bigint)', [orderId])), /already shipped/);
    await assert.rejects(as('customer2@bookstore.test', (c) => c.query('CALL sp_cancel_order($1::bigint)', [orderId])), code('P0002'));
  });

  test('moderation and suspension are written to audit_log', async () => {
    const pending = await bookByTitle("A Beginner's Guide to Dragon Husbandry");
    await as('admin@bookstore.test', (c) => c.query("UPDATE books SET status='approved' WHERE book_id=$1", [pending.book_id]));
    await as('admin@bookstore.test', (c) => c.query("UPDATE users SET status='suspended' WHERE email='customer2@bookstore.test'"));
    await as('admin@bookstore.test', (c) => c.query("UPDATE users SET status='active' WHERE email='customer2@bookstore.test'"));
    const all = (await as('admin@bookstore.test', (c) => c.query('SELECT table_name, action, old_data->>\'status\' AS was, new_data->>\'status\' AS now, old_data->>\'price_cents\' AS old_price, new_data->>\'price_cents\' AS new_price, actor_id FROM audit_log ORDER BY audit_id'))).rows;
    assert.ok(all.some((l) => l.table_name === 'books' && l.old_price === '34900' && l.new_price === '99900'), 'price change audited');
    const log = all.filter((l) => l.was !== l.now);                 // status transitions only
    assert.deepEqual(log.map((l) => [l.table_name, l.was, l.now]), [['books', 'pending', 'approved'], ['users', 'active', 'suspended'], ['users', 'suspended', 'active']]);
    assert.ok(log.every((l) => l.actor_id === U['admin@bookstore.test'].userId));
    assert.ok(!JSON.stringify(log).includes('password_hash'));
  });
});

describe('4. seller functions', () => {
  test('fn_upsert_book creates a pending book with ordered authors; edits keep ownership', async () => {
    const cat = (await admin.query("SELECT category_id FROM categories WHERE name='Tea & Spells'")).rows[0].category_id;
    const id = (await as('seller2@bookstore.test', (c) => c.query('SELECT fn_upsert_book(NULL, $1, $2, $3, $4, $5, $6, $7, $8) AS id',
      ['SQL Antipatterns', '978-1-93435-655-5', cat, 3999 * 10, 7, 'Avoiding the pitfalls', 'English', ['Bill Karwin', 'Co Author']]))).rows[0].id;
    const b = (await bookByTitle('SQL Antipatterns'));
    assert.equal(b.status, 'pending'); assert.equal(b.isbn, '9781934356555'); assert.equal(b.seller_id, U['seller2@bookstore.test'].userId);
    const authors = (await admin.query('SELECT a.name FROM book_authors ba JOIN authors a USING (author_id) WHERE book_id=$1 ORDER BY author_order', [id])).rows.map((r) => r.name);
    assert.deepEqual(authors, ['Bill Karwin', 'Co Author']);
    // other seller cannot edit it
    await assert.rejects(as('seller1@bookstore.test', (c) => c.query('SELECT fn_upsert_book($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, 'Hacked', '9781934356555', cat, 100, 1, '', 'English', ['x']])), code('P0002'));
    // restock logs a movement
    await as('seller2@bookstore.test', (c) => c.query('SELECT fn_upsert_book($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, 'SQL Antipatterns', '9781934356555', cat, 39990, 12, 'x', 'English', ['Bill Karwin']]));
    const mv = (await admin.query("SELECT delta, reason FROM stock_movements WHERE book_id=$1 ORDER BY movement_id", [id])).rows;
    assert.deepEqual(mv, [{ delta: 7, reason: 'restock' }, { delta: 5, reason: 'restock' }]);
    // soft delete
    await as('seller2@bookstore.test', (c) => c.query('CALL sp_remove_book($1::bigint)', [id]));
    assert.equal((await bookByTitle('SQL Antipatterns')).status, 'removed');
  });
  test('customers cannot call seller functions (no EXECUTE privilege)', async () => {
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query("SELECT fn_upsert_book(NULL,'t','9780000000002',1,100,1,'','English',ARRAY['a'])")), code('42501'));
  });
});

describe('5. role-based access control inside PostgreSQL', () => {
  test('the login role alone sees nothing (NOINHERIT)', async () => {
    await assert.rejects(asApp('SELECT * FROM books'), code('42501'));
    await assert.rejects(asApp('SELECT * FROM users'), code('42501'));
  });
  test('guest: only approved books, no personal data', async () => {
    const books = (await withRole(null, (c) => c.query('SELECT DISTINCT status FROM books'))).rows;
    assert.deepEqual(books, [{ status: 'approved' }]);
    await assert.rejects(withRole(null, (c) => c.query('SELECT * FROM users')), code('42501'));
    await assert.rejects(withRole(null, (c) => c.query('SELECT * FROM orders')), code('42501'));
    await assert.rejects(withRole(null, (c) => c.query('INSERT INTO cart_items VALUES (1,1,1)')), code('42501'));
  });
  test('customer: own rows only; cannot read password hashes or write catalogue', async () => {
    const orders = (await as('customer1@bookstore.test', (c) => c.query('SELECT DISTINCT user_id FROM orders'))).rows;
    assert.deepEqual(orders, [{ user_id: U['customer1@bookstore.test'].userId }]);
    assert.equal((await as('customer2@bookstore.test', (c) => c.query('SELECT * FROM orders WHERE user_id = $1', [U['customer1@bookstore.test'].userId]))).rowCount, 0);
    assert.equal((await as('customer1@bookstore.test', (c) => c.query('SELECT user_id, name FROM users'))).rowCount, 1, 'sees only own user row');
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('SELECT password_hash FROM users')), code('42501'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('UPDATE books SET price_cents = 1')), code('42501'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('SELECT * FROM audit_log')), code('42501'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('UPDATE orders SET status=\'Delivered\'')), code('42501'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query("INSERT INTO cart_items (user_id, book_id, quantity) VALUES ($1, 1, 1)", [U['customer2@bookstore.test'].userId])), code('42501'));   // RLS WITH CHECK
  });
  test('seller: sees own pending books but not a rival\'s; no payments; no direct book writes', async () => {
    const mine = (await as('seller2@bookstore.test', (c) => c.query("SELECT title FROM books WHERE status IN ('pending','rejected') ORDER BY title"))).rows.map((r) => r.title);
    assert.deepEqual(mine, ['Quick Spells for Busy Wizards']);        // seller2's rejected; the Dragon Husbandry listing was approved earlier
    const rival = (await as('seller1@bookstore.test', (c) => c.query("SELECT title FROM books WHERE status IN ('pending','rejected')"))).rows;
    assert.deepEqual(rival, [], 'seller1 has none and cannot see seller2\'s');
    await assert.rejects(as('seller1@bookstore.test', (c) => c.query('SELECT * FROM payments')), code('42501'));
    await assert.rejects(as('seller1@bookstore.test', (c) => c.query('UPDATE books SET price_cents = 1')), code('42501'));
    await assert.rejects(as('seller1@bookstore.test', (c) => c.query("UPDATE books SET status = 'approved'")), code('42501'));
  });
  test('same report function, different rows per role (RLS on the invoker)', async () => {
    const rep = (email) => as(email, (c) => c.query("SELECT sum(revenue_cents)::int AS r FROM fn_sales_report(current_date - 1, current_date)")).then((x) => x.rows[0].r);
    const s1 = await rep('seller1@bookstore.test'), s2 = await rep('seller2@bookstore.test'), a = await rep('admin@bookstore.test');
    assert.ok(s1 > 0, 'seller1 sold Hobbit/Coraline');
    assert.equal(a, s1 + s2, 'admin total = sum of sellers');
  });
  test('admin: moderates and suspends others but not themselves; all roles can read the category tree', async () => {
    const self = await as('admin@bookstore.test', (c) => c.query("UPDATE users SET status='suspended' WHERE email='admin@bookstore.test'"));
    assert.equal(self.rowCount, 0, 'RLS blocks self-suspension');
    await assert.rejects(as('admin@bookstore.test', (c) => c.query("UPDATE users SET email='x@y.z' WHERE email='customer1@bookstore.test'")), code('42501'));   // column-level GRANT
    for (const e of ['customer1@bookstore.test', 'seller1@bookstore.test', 'admin@bookstore.test'])
      assert.ok((await as(e, (c) => c.query('SELECT * FROM fn_category_tree()'))).rowCount >= 15);
  });
  test('procedures reject the wrong role even if GRANT were bypassed (fn_require_role)', async () => {
    // run the checkout procedure as the *owner* but with a seller identity -> still refused
    await admin.query("SELECT set_config('app.user_id', $1, false)", [String(U['seller1@bookstore.test'].userId)]);
    await assert.rejects(admin.query('CALL sp_place_order(1::bigint, $1::text, NULL::bigint)', ['card']), code('42501'));
    await admin.query("SELECT set_config('app.user_id', '', false)");
  });
});

describe('6. queries', () => {
  test('recursive category tree: depth, path and subtree totals', async () => {
    const rows = (await as('customer1@bookstore.test', (c) => c.query('SELECT * FROM fn_category_tree()'))).rows;
    const cs = rows.find((r) => r.name === 'Sky & Stars');
    assert.equal(cs.depth, 2); assert.equal(cs.path, 'Fairy Tales & Retellings > Enchanted Lands > Sky & Stars');
    const enchanted = rows.find((r) => r.name === 'Enchanted Lands');
    assert.equal(enchanted.subtree_books, enchanted.direct_books + rows.filter((r) => r.parent_id === enchanted.category_id).reduce((s, r) => s + r.subtree_books, 0));
    const sub = (await as('customer1@bookstore.test', (c) => c.query("SELECT name FROM fn_category_tree((SELECT category_id FROM categories WHERE name='Portal Worlds'))"))).rows.map((r) => r.name);
    assert.deepEqual(sub.sort(), ['Dark Whimsy', 'Funny Fantasy', 'Portal Worlds', 'Timeless Tales', 'Wonderlands']);
  });
  test('catalogue view joins authors, category and store; full-text search works', async () => {
    const r = (await withRole(null, (c) => c.query("SELECT authors, category_name, store_name FROM v_book_catalog WHERE title = 'Good Omens'"))).rows[0];
    assert.equal(r.authors, 'Terry Pratchett, Neil Gaiman');
    assert.equal(r.category_name, 'Funny Fantasy'); assert.equal(r.store_name, 'Page Turner Books');
    const fts = (await withRole(null, (c) => c.query("SELECT title FROM v_book_catalog WHERE search_vector @@ websearch_to_tsquery('english', 'wizard magic')"))).rows.map((x) => x.title);
    assert.ok(fts.includes("Harry Potter and the Philosopher's Stone"));
  });
});

describe('9. SE-backlog tables are locked down by the same three layers', () => {
  test('password_resets cannot be read by any application role', async () => {
    for (const email of ['customer1@bookstore.test', 'seller1@bookstore.test', 'admin@bookstore.test']) {
      await assert.rejects(as(email, (c) => c.query('SELECT * FROM password_resets')), code('42501'));
    }
    await assert.rejects(withRole(null, (c) => c.query('SELECT * FROM wishlist_items')), code('42501'));
  });
  test('notifications: you only see your own rows and may only change read_at', async () => {
    await admin.query("SELECT fn_notify($1, 'x', 'for customer1', '')", [U['customer1@bookstore.test'].userId]);
    const mine = await as('customer1@bookstore.test', (c) => c.query('SELECT subject FROM notifications'));
    assert.ok(mine.rows.some((r) => r.subject === 'for customer1'));
    const other = await as('customer2@bookstore.test', (c) => c.query('SELECT subject FROM notifications'));
    assert.ok(!other.rows.some((r) => r.subject === 'for customer1'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query("UPDATE notifications SET subject = 'hacked'")), code('42501'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query("INSERT INTO notifications (user_id, kind, subject) VALUES (app_user_id(), 'x', 'forged')")), code('42501'));
  });
  test('a customer cannot promote themselves; only fn_decide_seller_application (admin) can', async () => {
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query("UPDATE users SET role_id = 2")), code('42501'));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query('SELECT fn_decide_seller_application(1, true, NULL)')), code('42501'));
    await assert.rejects(as('seller1@bookstore.test', (c) => c.query('SELECT fn_apply_seller($1, $2)', ['S', 'r'])), code('42501'));
  });
  test('one pending application per person (partial unique index)', async () => {
    await as('customer1@bookstore.test', (c) => c.query("SELECT fn_apply_seller('Karan Books', '')"));
    await assert.rejects(as('customer1@bookstore.test', (c) => c.query("SELECT fn_apply_seller('Karan Books 2', '')")), code('23505'));
  });
});
