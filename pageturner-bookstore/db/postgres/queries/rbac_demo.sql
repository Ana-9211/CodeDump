-- =====================================================================
-- Role-based access control, shown live. Run as the database owner:
--   psql -d bookstore_dbms -f db/postgres/queries/rbac_demo.sql
-- "SET ROLE" is exactly what the web app does for every request.
-- \set ON_ERROR_STOP is OFF on purpose: each denied statement prints its error and the demo continues.
-- =====================================================================
\set VERBOSITY terse

\echo '=== GUEST: can read the catalogue, nothing else'
SET ROLE bookstore_guest;
SELECT count(*) AS visible_books FROM books;               -- only approved books (RLS)
SELECT * FROM orders;                                      -- permission denied
SELECT password_hash FROM users;                           -- permission denied
RESET ROLE;

\echo '=== CUSTOMER 1: sees only their own rows'
SELECT set_config('app.user_id', (SELECT user_id::text FROM users WHERE email = 'customer1@bookstore.test'), false);
SET ROLE bookstore_customer;
SELECT count(*) AS my_orders FROM orders;                  -- Karan''s only
SELECT count(*) AS all_users_visible FROM users;           -- 1: only themselves
SELECT password_hash FROM users;                           -- permission denied (column privilege)
UPDATE books SET price_cents = 1;                          -- permission denied
UPDATE users SET role_id = 3;                              -- permission denied (cannot make themselves admin)
SELECT * FROM audit_log;                                   -- permission denied
RESET ROLE;

\echo '=== SELLER 1: sees only order lines that contain their own books, never payments'
SELECT set_config('app.user_id', (SELECT user_id::text FROM users WHERE email = 'seller1@bookstore.test'), false);
SET ROLE bookstore_seller;
SELECT count(*) AS my_order_lines FROM order_items;
SELECT count(*) AS books_visible_to_seller FROM books;   -- approved books of everyone + own drafts
UPDATE books SET price_cents = 100 WHERE seller_id <> app_user_id();                           -- permission denied: sellers change books only through fn_upsert_book()
SELECT * FROM payments;                                    -- permission denied
RESET ROLE;

\echo '=== ADMIN: everything read-only except moderation columns'
SELECT set_config('app.user_id', (SELECT user_id::text FROM users WHERE email = 'admin@bookstore.test'), false);
SET ROLE bookstore_admin;
SELECT count(*) AS orders_seen FROM orders;
SELECT count(*) AS audit_rows FROM audit_log;
UPDATE orders SET total_cents = 0;                         -- permission denied: admins cannot rewrite history
DELETE FROM audit_log;                                     -- permission denied: audit log is append-only
RESET ROLE;
