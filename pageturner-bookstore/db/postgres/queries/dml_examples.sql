-- =====================================================================
-- DML examples (INSERT / UPDATE / DELETE / SELECT) - run in psql:
--   psql -d bookstore_dbms -f db/postgres/queries/dml_examples.sql
-- Everything runs inside a transaction that is ROLLED BACK at the end,
-- so you can run it any number of times without changing the shop.
-- =====================================================================
BEGIN;

-- INSERT: a new author, a new book (seller 2), and the M:N link between them
INSERT INTO authors (name) VALUES ('Example Writer') RETURNING author_id;
INSERT INTO books (seller_id, category_id, title, isbn, description, price_cents, stock)
SELECT u.user_id, c.category_id, 'Demo Book', '9780306406157', 'Inserted by dml_examples.sql', 29900, 12
  FROM users u, categories c WHERE u.email = 'seller2@bookstore.test' AND c.name = 'Wonderlands'
RETURNING book_id, status;               -- status defaults to 'pending'
INSERT INTO book_authors (book_id, author_id, author_order)
SELECT b.book_id, a.author_id, 1 FROM books b, authors a WHERE b.title = 'Demo Book' AND a.name = 'Example Writer';

-- INSERT ... SELECT with ON CONFLICT (upsert): add to cart, or bump the quantity
INSERT INTO cart_items (user_id, book_id, quantity)
SELECT u.user_id, b.book_id, 1 FROM users u, books b WHERE u.email = 'customer1@bookstore.test' AND b.title = 'Stardust'
ON CONFLICT (user_id, book_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + 1, 10);

-- UPDATE: 10% price cut for one category (UPDATE ... FROM with a join, audited by trigger)
UPDATE books b SET price_cents = (b.price_cents * 90) / 100
  FROM categories c WHERE c.category_id = b.category_id AND c.name = 'Wonderlands' AND b.status = 'approved'
RETURNING b.title, b.price_cents;

-- UPDATE with a subquery: restock every approved book that is nearly sold out
UPDATE books SET stock = stock + 20
 WHERE status = 'approved' AND stock <= low_stock_threshold
   AND book_id IN (SELECT book_id FROM v_book_catalog WHERE status = 'approved')
RETURNING title, stock;

-- DELETE: remove a cart line, and delete with a subquery (carts of suspended users)
DELETE FROM cart_items WHERE book_id = (SELECT book_id FROM books WHERE title = 'Stardust');
DELETE FROM cart_items WHERE user_id IN (SELECT user_id FROM users WHERE status = 'suspended');

-- The triggers have been busy: here is what the audit trail recorded in this transaction
SELECT table_name, action, old_data ->> 'price_cents' AS old_price, new_data ->> 'price_cents' AS new_price
  FROM audit_log ORDER BY audit_id DESC LIMIT 5;

ROLLBACK;   -- nothing above is kept
