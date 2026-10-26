-- =====================================================================
-- 05_security.sql : role-based access control INSIDE the database
--
-- Three layers, like three locks on one door:
--   1. GRANT / REVOKE   - which TABLES / COLUMNS / FUNCTIONS a role may touch
--   2. Row Level Security - which ROWS of those tables the role may see/change
--   3. SECURITY DEFINER routines - the only door for complicated writes, and
--      each one re-checks the caller's role (fn_require_role)
-- Even if the web layer had a bug, PostgreSQL itself refuses forbidden work.
-- =====================================================================

-- ---------- 0. start from "nothing is allowed" -------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM PUBLIC;

-- The blanket REVOKE above also removed EXECUTE on the citext extension's own
-- functions (e.g. citext_eq), which would break `WHERE email = ...` for every
-- non-superuser role. Give those extension routines back to PUBLIC.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig
               FROM pg_proc p
               JOIN pg_depend d     ON d.objid = p.oid AND d.deptype = 'e'
               JOIN pg_extension e  ON e.oid = d.refobjid
              WHERE e.extname = 'citext'
    LOOP
        EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO PUBLIC', r.sig);
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA public
   TO bookstore_app, bookstore_guest, bookstore_customer, bookstore_seller, bookstore_admin;

-- ---------- 1. table / column privileges -------------------------------
-- public catalogue data: everyone (including guests) may read
GRANT SELECT ON roles, categories, authors, book_authors, seller_profiles, books, app_settings,
                v_book_catalog
   TO bookstore_guest, bookstore_customer, bookstore_seller, bookstore_admin;

-- users: never expose password_hash or lock counters (column-level GRANT)
GRANT SELECT (user_id, name, email, role_id, status, phone, created_at, updated_at) ON users
   TO bookstore_customer, bookstore_seller, bookstore_admin;
GRANT UPDATE (status) ON users TO bookstore_admin;                       -- suspend / reactivate

-- customer
GRANT SELECT, INSERT, UPDATE, DELETE ON addresses, cart_items TO bookstore_customer;
GRANT SELECT ON orders, order_items, payments, v_order_overview  TO bookstore_customer;

-- seller
GRANT UPDATE (store_name, description) ON seller_profiles TO bookstore_seller;
GRANT SELECT ON orders, order_items, stock_movements, v_low_stock TO bookstore_seller;
GRANT UPDATE (fulfilment_status) ON order_items TO bookstore_seller;     -- pack / ship / deliver

-- admin
GRANT SELECT ON orders, order_items, payments, stock_movements, audit_log,
                v_order_overview, v_seller_performance TO bookstore_admin;
GRANT UPDATE (status, rejection_reason) ON books TO bookstore_admin;     -- approve / reject
GRANT UPDATE (setting_value) ON app_settings TO bookstore_admin;

-- ---------- 2. routine privileges --------------------------------------
GRANT EXECUTE ON FUNCTION app_user_id(), fn_setting(TEXT)
   TO bookstore_app, bookstore_guest, bookstore_customer, bookstore_seller, bookstore_admin;
GRANT EXECUTE ON FUNCTION fn_category_tree(INT)
   TO bookstore_guest, bookstore_customer, bookstore_seller, bookstore_admin;

-- the login role can ONLY call these (pre-login + NoSQL bridge)
GRANT EXECUTE ON FUNCTION fn_register_user(TEXT, TEXT, TEXT, TEXT, TEXT),
                          fn_get_login(TEXT), fn_record_login(BIGINT, BOOLEAN),
                          fn_get_session_user(BIGINT), fn_has_purchased(BIGINT, BIGINT)
   TO bookstore_app;
GRANT EXECUTE ON PROCEDURE sp_set_rating_summary(BIGINT, NUMERIC, INT) TO bookstore_app;

GRANT EXECUTE ON FUNCTION  fn_cart_totals()            TO bookstore_customer;
GRANT EXECUTE ON PROCEDURE sp_place_order(BIGINT, TEXT, BIGINT) TO bookstore_customer;
GRANT EXECUTE ON PROCEDURE sp_cancel_order(BIGINT)     TO bookstore_customer;

GRANT EXECUTE ON FUNCTION  fn_upsert_book(BIGINT, TEXT, TEXT, INT, INT, INT, TEXT, TEXT, TEXT[]) TO bookstore_seller;
GRANT EXECUTE ON PROCEDURE sp_remove_book(BIGINT)      TO bookstore_seller;

GRANT EXECUTE ON FUNCTION fn_sales_report(DATE, DATE)  TO bookstore_seller, bookstore_admin;

-- fn_require_role is called inside SECURITY DEFINER routines (runs as owner) - no grant needed.

-- ---------- 3. Row Level Security --------------------------------------
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE books           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- users: see yourself; admin sees all and may update everyone except themselves
CREATE POLICY users_self_select  ON users FOR SELECT TO bookstore_customer, bookstore_seller
    USING (user_id = app_user_id());
CREATE POLICY users_admin_select ON users FOR SELECT TO bookstore_admin USING (true);
CREATE POLICY users_admin_update ON users FOR UPDATE TO bookstore_admin
    USING (user_id <> app_user_id()) WITH CHECK (true);

-- seller_profiles: store names are public; a seller edits only their own
CREATE POLICY sp_read       ON seller_profiles FOR SELECT
    TO bookstore_guest, bookstore_customer, bookstore_seller, bookstore_admin USING (true);
CREATE POLICY sp_update_own ON seller_profiles FOR UPDATE TO bookstore_seller
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- addresses and cart: strictly private to the owner
CREATE POLICY addr_own ON addresses FOR ALL TO bookstore_customer
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
CREATE POLICY cart_own ON cart_items FOR ALL TO bookstore_customer
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- books: visitors/customers see approved books; a seller also sees their own
--        pending/rejected ones; admin sees all and moderates
CREATE POLICY books_public       ON books FOR SELECT TO bookstore_guest, bookstore_customer
    USING (status = 'approved');
CREATE POLICY books_seller       ON books FOR SELECT TO bookstore_seller
    USING (status = 'approved' OR seller_id = app_user_id());
CREATE POLICY books_admin_select ON books FOR SELECT TO bookstore_admin USING (true);
CREATE POLICY books_admin_update ON books FOR UPDATE TO bookstore_admin USING (true) WITH CHECK (true);

-- orders: customer -> own; seller -> orders containing their items; admin -> all
CREATE POLICY orders_customer ON orders FOR SELECT TO bookstore_customer USING (user_id = app_user_id());
CREATE POLICY orders_seller   ON orders FOR SELECT TO bookstore_seller
    USING (EXISTS (SELECT 1 FROM order_items oi
                    WHERE oi.order_id = orders.order_id AND oi.seller_id = app_user_id()));
CREATE POLICY orders_admin    ON orders FOR SELECT TO bookstore_admin USING (true);

-- order lines: customer -> lines of own orders; seller -> own lines (and may advance their status)
CREATE POLICY oi_customer      ON order_items FOR SELECT TO bookstore_customer
    USING (EXISTS (SELECT 1 FROM orders o WHERE o.order_id = order_items.order_id));
CREATE POLICY oi_seller_select ON order_items FOR SELECT TO bookstore_seller USING (seller_id = app_user_id());
CREATE POLICY oi_seller_update ON order_items FOR UPDATE TO bookstore_seller
    USING (seller_id = app_user_id()) WITH CHECK (seller_id = app_user_id());
CREATE POLICY oi_admin         ON order_items FOR SELECT TO bookstore_admin USING (true);

-- payments: customer -> own; admin -> all; sellers never see payment data
CREATE POLICY pay_customer ON payments FOR SELECT TO bookstore_customer
    USING (EXISTS (SELECT 1 FROM orders o WHERE o.order_id = payments.order_id));
CREATE POLICY pay_admin    ON payments FOR SELECT TO bookstore_admin USING (true);

-- stock ledger: seller -> movements of own books; admin -> all
CREATE POLICY sm_seller ON stock_movements FOR SELECT TO bookstore_seller
    USING (EXISTS (SELECT 1 FROM books b WHERE b.book_id = stock_movements.book_id AND b.seller_id = app_user_id()));
CREATE POLICY sm_admin  ON stock_movements FOR SELECT TO bookstore_admin USING (true);

-- audit log: admin read-only
CREATE POLICY audit_admin ON audit_log FOR SELECT TO bookstore_admin USING (true);
