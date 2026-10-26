-- =====================================================================
-- 02_functions.sql : helper functions, stored procedures, report functions
--
-- Two kinds of routine appear below, on purpose:
--   SECURITY INVOKER (default) - runs with the caller's own privileges, so
--       Row Level Security automatically limits what the caller can see.
--       (fn_cart_totals, fn_sales_report, fn_category_tree)
--   SECURITY DEFINER           - runs with the owner's privileges, used for
--       controlled write operations that must touch several tables the caller
--       is NOT allowed to write directly (sp_place_order, fn_upsert_book ...).
--       Each one re-checks who is calling via fn_require_role().
--
-- "Who is calling" is passed in by the web app with
--     SELECT set_config('app.user_id', '<id>', true);   -- transaction-local
-- and read back with app_user_id().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_user_id() RETURNS BIGINT
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::bigint $$;

CREATE OR REPLACE FUNCTION fn_setting(p_key TEXT) RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT setting_value FROM app_settings WHERE setting_key = p_key $$;

-- Guard used at the top of every privileged routine.
-- Returns the caller's user_id or raises 28000 (not logged in) / 42501 (wrong role).
CREATE OR REPLACE FUNCTION fn_require_role(p_role TEXT) RETURNS BIGINT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_id BIGINT := app_user_id();
BEGIN
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
    END IF;
    PERFORM 1
      FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = v_id AND r.role_name = p_role AND u.status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'this action requires an active % account', p_role USING ERRCODE = '42501';
    END IF;
    RETURN v_id;
END
$$;

-- ---------------------------------------------------------------------
-- Authentication support (called by the API *before* a role is known)
-- The API hashes passwords with bcrypt; the database only stores the hash.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_register_user(
    p_name TEXT, p_email TEXT, p_password_hash TEXT, p_role TEXT, p_store_name TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_id BIGINT;
BEGIN
    IF p_role NOT IN ('customer', 'seller') THEN
        RAISE EXCEPTION 'the % role cannot be self-registered', p_role USING ERRCODE = '42501';
    END IF;
    IF p_role = 'seller' AND (p_store_name IS NULL OR btrim(p_store_name) = '') THEN
        RAISE EXCEPTION 'a store name is required for seller accounts' USING ERRCODE = '22023';
    END IF;

    INSERT INTO users (name, email, password_hash, role_id)
    SELECT btrim(p_name), p_email, p_password_hash, role_id FROM roles WHERE role_name = p_role
    RETURNING user_id INTO v_id;

    IF p_role = 'seller' THEN
        INSERT INTO seller_profiles (user_id, store_name) VALUES (v_id, btrim(p_store_name));
    END IF;
    RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION fn_get_login(p_email TEXT)
RETURNS TABLE (user_id BIGINT, name TEXT, role_name TEXT, password_hash TEXT, status TEXT, locked_until TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
    SELECT u.user_id, u.name::text, r.role_name::text, u.password_hash, u.status::text, u.locked_until
      FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE u.email = p_email
$$;

-- Brute-force protection: N failures lock the account for M minutes (both in app_settings)
CREATE OR REPLACE FUNCTION fn_record_login(p_user BIGINT, p_success BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    IF p_success THEN
        UPDATE users SET failed_login_count = 0, locked_until = NULL
         WHERE user_id = p_user AND (failed_login_count <> 0 OR locked_until IS NOT NULL);
    ELSE
        UPDATE users
           SET failed_login_count = failed_login_count + 1,
               locked_until = CASE
                   WHEN failed_login_count + 1 >= fn_setting('max_failed_logins')
                   THEN now() + make_interval(mins => fn_setting('lockout_minutes'))
                   ELSE locked_until END
         WHERE user_id = p_user;
    END IF;
END
$$;

-- Re-checked on every request so a suspended user is locked out immediately
CREATE OR REPLACE FUNCTION fn_get_session_user(p_user BIGINT)
RETURNS TABLE (user_id BIGINT, name TEXT, role_name TEXT, status TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
    SELECT u.user_id, u.name::text, r.role_name::text, u.status::text
      FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = p_user
$$;

-- ---------------------------------------------------------------------
-- Cart arithmetic (SECURITY INVOKER: RLS limits it to the caller's own cart)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cart_totals()
RETURNS TABLE (item_count INT, subtotal_cents INT, tax_cents INT, shipping_cents INT, total_cents INT)
LANGUAGE sql STABLE AS
$$
    WITH cart AS (
        SELECT COALESCE(SUM(ci.quantity), 0)::int                    AS items,
               COALESCE(SUM(ci.quantity * b.price_cents), 0)::int    AS sub
          FROM cart_items ci
          JOIN books b ON b.book_id = ci.book_id
         WHERE ci.user_id = app_user_id()
    ), priced AS (
        SELECT items, sub,
               round(sub * fn_setting('tax_rate_percent') / 100.0)::int AS tax,
               CASE WHEN sub = 0 OR sub >= fn_setting('free_shipping_threshold_cents')
                    THEN 0 ELSE fn_setting('shipping_flat_cents') END   AS ship
          FROM cart
    )
    SELECT items, sub, tax, ship, sub + tax + ship FROM priced
$$;

-- ---------------------------------------------------------------------
-- Checkout: ONE atomic stored procedure
--   1. verify caller is an active customer and owns the address
--   2. lock the cart's book rows (FOR UPDATE, in id order => no deadlocks)
--   3. check availability, 4. create order + items (trigger deducts stock)
--   5. record payment, 6. empty the cart
-- If ANY step raises, the whole transaction rolls back: no half-placed orders.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_place_order(
    IN p_address_id BIGINT, IN p_payment_method TEXT, INOUT p_order_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_user    BIGINT := fn_require_role('customer');
    v_addr    addresses%ROWTYPE;
    r         RECORD;
    v_lines   INT := 0;
    v_sub     INT;
    v_tax     INT;
    v_ship    INT;
    v_total   INT;
BEGIN
    IF p_payment_method NOT IN ('card', 'upi', 'cod') THEN
        RAISE EXCEPTION 'unsupported payment method %', p_payment_method USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_addr FROM addresses WHERE address_id = p_address_id AND user_id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'delivery address % not found', p_address_id USING ERRCODE = 'P0002';
    END IF;

    -- row locks: two customers cannot both buy the last copy
    FOR r IN
        SELECT ci.book_id, ci.quantity, b.title, b.stock, b.status
          FROM cart_items ci JOIN books b ON b.book_id = ci.book_id
         WHERE ci.user_id = v_user
         ORDER BY b.book_id
           FOR UPDATE OF b
    LOOP
        IF r.status <> 'approved' THEN
            RAISE EXCEPTION '"%" is no longer available', r.title USING ERRCODE = '55000';
        END IF;
        IF r.stock < r.quantity THEN
            RAISE EXCEPTION 'only % cop% of "%" left in stock', r.stock,
                   CASE WHEN r.stock = 1 THEN 'y' ELSE 'ies' END, r.title USING ERRCODE = '55000';
        END IF;
        v_lines := v_lines + 1;
    END LOOP;

    IF v_lines = 0 THEN
        RAISE EXCEPTION 'your cart is empty' USING ERRCODE = '55000';
    END IF;

    SELECT subtotal_cents, tax_cents, shipping_cents, total_cents
      INTO v_sub, v_tax, v_ship, v_total
      FROM fn_cart_totals();

    INSERT INTO orders (user_id, ship_full_name, ship_line1, ship_line2, ship_city, ship_state,
                        ship_postal_code, ship_country, ship_phone,
                        subtotal_cents, tax_cents, shipping_cents, total_cents)
    VALUES (v_user, v_addr.full_name, v_addr.line1, v_addr.line2, v_addr.city, v_addr.state,
            v_addr.postal_code, v_addr.country, v_addr.phone, v_sub, v_tax, v_ship, v_total)
    RETURNING order_id INTO p_order_id;

    -- price/title snapshot; trg_order_items_take_stock deducts stock for each row
    INSERT INTO order_items (order_id, book_id, seller_id, title_snapshot, isbn_snapshot,
                             unit_price_cents, quantity, line_total_cents)
    SELECT p_order_id, b.book_id, b.seller_id, b.title, b.isbn, b.price_cents, ci.quantity,
           b.price_cents * ci.quantity
      FROM cart_items ci JOIN books b ON b.book_id = ci.book_id
     WHERE ci.user_id = v_user;

    INSERT INTO payments (order_id, method, amount_cents, status, paid_at)
    VALUES (p_order_id, p_payment_method, v_total,
            CASE WHEN p_payment_method = 'cod' THEN 'Pending' ELSE 'Paid' END,
            CASE WHEN p_payment_method = 'cod' THEN NULL ELSE now() END);

    DELETE FROM cart_items WHERE user_id = v_user;
END
$$;

-- Customer cancels BEFORE anything has shipped. Setting each item to 'Cancelled'
-- fires the triggers that return stock and roll the order status up.
CREATE OR REPLACE PROCEDURE sp_cancel_order(IN p_order_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_user    BIGINT := fn_require_role('customer');
    v_owner   BIGINT;
    v_status  TEXT;
    v_blocked INT;
BEGIN
    SELECT user_id, status INTO v_owner, v_status FROM orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_owner <> v_user THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P0002';
    END IF;
    IF v_status = 'Cancelled' THEN
        RAISE EXCEPTION 'this order is already cancelled' USING ERRCODE = '55000';
    END IF;

    SELECT count(*) INTO v_blocked FROM order_items
     WHERE order_id = p_order_id AND fulfilment_status IN ('Shipped', 'Delivered');
    IF v_blocked > 0 THEN
        RAISE EXCEPTION 'cannot cancel: % item(s) have already shipped', v_blocked USING ERRCODE = '55000';
    END IF;

    UPDATE order_items SET fulfilment_status = 'Cancelled'
     WHERE order_id = p_order_id AND fulfilment_status IN ('Placed', 'Packed');

    UPDATE payments SET status = CASE WHEN status = 'Paid' THEN 'Refunded' ELSE 'Void' END
     WHERE order_id = p_order_id;
END
$$;

-- ---------------------------------------------------------------------
-- Seller operations (sellers get NO direct INSERT/UPDATE on books; they go
-- through these functions, which can only touch the caller's own listings)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_upsert_book(
    p_book_id BIGINT, p_title TEXT, p_isbn TEXT, p_category_id INT, p_price_cents INT,
    p_stock INT, p_description TEXT, p_language TEXT, p_authors TEXT[]
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_user      BIGINT := fn_require_role('seller');
    v_book      BIGINT;
    v_old_stock INT;
    v_author    TEXT;
    v_author_id INT;
    v_pos       SMALLINT := 0;
    v_isbn      TEXT := regexp_replace(upper(coalesce(p_isbn, '')), '[- ]', '', 'g');
BEGIN
    IF p_authors IS NULL OR cardinality(p_authors) = 0 THEN
        RAISE EXCEPTION 'at least one author is required' USING ERRCODE = '22023';
    END IF;

    IF p_book_id IS NULL THEN
        INSERT INTO books (seller_id, category_id, isbn, title, description, language, price_cents, stock)
        VALUES (v_user, p_category_id, v_isbn, btrim(p_title), coalesce(p_description, ''),
                coalesce(NULLIF(btrim(p_language), ''), 'English'), p_price_cents, p_stock)
        RETURNING book_id INTO v_book;
        IF p_stock > 0 THEN
            INSERT INTO stock_movements (book_id, delta, reason, created_by)
            VALUES (v_book, p_stock, 'restock', v_user);
        END IF;
    ELSE
        SELECT stock INTO v_old_stock FROM books
         WHERE book_id = p_book_id AND seller_id = v_user AND status <> 'removed' FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'book % not found among your listings', p_book_id USING ERRCODE = 'P0002';
        END IF;

        UPDATE books
           SET category_id = p_category_id, isbn = v_isbn, title = btrim(p_title),
               description = coalesce(p_description, ''),
               language = coalesce(NULLIF(btrim(p_language), ''), 'English'),
               price_cents = p_price_cents, stock = p_stock,
               -- editing a rejected book re-submits it for approval
               rejection_reason = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_reason END,
               status = CASE WHEN status = 'rejected' THEN 'pending' ELSE status END
         WHERE book_id = p_book_id;

        IF p_stock <> v_old_stock THEN
            INSERT INTO stock_movements (book_id, delta, reason, created_by)
            VALUES (p_book_id, p_stock - v_old_stock,
                    CASE WHEN p_stock > v_old_stock THEN 'restock' ELSE 'adjustment' END, v_user);
        END IF;
        v_book := p_book_id;
        DELETE FROM book_authors WHERE book_id = v_book;
    END IF;

    FOREACH v_author IN ARRAY p_authors LOOP
        v_pos := v_pos + 1;
        INSERT INTO authors (name) VALUES (btrim(v_author))
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name      -- no-op, lets RETURNING work
        RETURNING author_id INTO v_author_id;
        INSERT INTO book_authors (book_id, author_id, author_order) VALUES (v_book, v_author_id, v_pos);
    END LOOP;
    RETURN v_book;
END
$$;

-- "Delete" a listing. Orders reference books, so it is a soft delete (status = removed).
CREATE OR REPLACE PROCEDURE sp_remove_book(IN p_book_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_user BIGINT := fn_require_role('seller');
BEGIN
    UPDATE books SET status = 'removed'
     WHERE book_id = p_book_id AND seller_id = v_user AND status <> 'removed';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'book % not found among your listings', p_book_id USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM cart_items WHERE book_id = p_book_id;
END
$$;

-- ---------------------------------------------------------------------
-- Bridge to the NoSQL layer (reviews live in MongoDB)
-- ---------------------------------------------------------------------
-- Only the application login role may call these two (see 05_security.sql).
CREATE OR REPLACE PROCEDURE sp_set_rating_summary(IN p_book_id BIGINT, IN p_avg NUMERIC, IN p_count INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
    UPDATE books SET avg_rating = round(p_avg, 2), review_count = p_count WHERE book_id = p_book_id;
$$;

CREATE OR REPLACE FUNCTION fn_has_purchased(p_user BIGINT, p_book BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
    SELECT EXISTS (
        SELECT 1 FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
         WHERE o.user_id = p_user AND oi.book_id = p_book AND oi.fulfilment_status <> 'Cancelled'
    )
$$;

-- ---------------------------------------------------------------------
-- Reports (SECURITY INVOKER: a seller automatically sees only their own
-- sales, an admin sees everything - same function, different rows, thanks to RLS)
-- CTE + generate_series (fills days with no sales) + window function (running total)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sales_report(p_from DATE, p_to DATE)
RETURNS TABLE (day DATE, orders_count BIGINT, units BIGINT, revenue_cents BIGINT, running_revenue_cents BIGINT)
LANGUAGE sql STABLE AS
$$
    WITH days AS (
        SELECT g::date AS d FROM generate_series(p_from, p_to, interval '1 day') AS g
    ), daily AS (
        SELECT o.placed_at::date                AS d,
               count(DISTINCT o.order_id)       AS orders_count,
               sum(oi.quantity)                 AS units,
               sum(oi.line_total_cents)         AS revenue
          FROM order_items oi
          JOIN orders o ON o.order_id = oi.order_id
         WHERE oi.fulfilment_status <> 'Cancelled'
           AND o.placed_at::date BETWEEN p_from AND p_to
         GROUP BY o.placed_at::date
    )
    SELECT days.d,
           COALESCE(daily.orders_count, 0)::bigint,
           COALESCE(daily.units, 0)::bigint,
           COALESCE(daily.revenue, 0)::bigint,
           (SUM(COALESCE(daily.revenue, 0)) OVER (ORDER BY days.d))::bigint
      FROM days LEFT JOIN daily ON daily.d = days.d
     ORDER BY days.d
$$;

-- Category tree with a RECURSIVE CTE: depth, breadcrumb path and book counts
-- (direct = in this category, subtree = this category and all its descendants)
CREATE OR REPLACE FUNCTION fn_category_tree(p_root INT DEFAULT NULL)
RETURNS TABLE (category_id INT, name TEXT, parent_id INT, depth INT, path TEXT, direct_books BIGINT, subtree_books BIGINT)
LANGUAGE sql STABLE AS
$$
    WITH RECURSIVE tree AS (
        SELECT c.category_id, c.name::text AS name, c.parent_id, 0 AS depth,
               c.name::text AS path, ARRAY[c.category_id] AS ids
          FROM categories c
         WHERE (p_root IS NULL AND c.parent_id IS NULL) OR c.category_id = p_root
        UNION ALL
        SELECT c.category_id, c.name::text, c.parent_id, t.depth + 1,
               t.path || ' > ' || c.name, t.ids || c.category_id
          FROM categories c
          JOIN tree t ON c.parent_id = t.category_id
    )
    SELECT t.category_id, t.name, t.parent_id, t.depth, t.path,
           (SELECT count(*) FROM books b
             WHERE b.category_id = t.category_id AND b.status = 'approved'),
           (SELECT count(*) FROM books b JOIN tree d ON d.category_id = b.category_id
             WHERE b.status = 'approved' AND d.ids @> ARRAY[t.category_id])
      FROM tree t
     ORDER BY t.path
$$;
