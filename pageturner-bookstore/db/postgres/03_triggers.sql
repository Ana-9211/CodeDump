-- =====================================================================
-- 03_triggers.sql : automatic reactions to data changes
--
-- Analogy: triggers are the shop's motion sensors. Nobody has to remember to
-- flip a switch - when a row is inserted or updated, the sensor fires and the
-- follow-up work happens in the SAME transaction (all-or-nothing).
--
-- Trigger functions are SECURITY DEFINER because a customer who places an order
-- is not allowed to UPDATE books directly, yet the stock must still go down.
-- =====================================================================

-- 1. generic "updated_at" stamp ----------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS
$$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_users_updated       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_books_updated       BEFORE UPDATE ON books       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_orders_updated      BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_order_items_updated BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. only real sellers may own books ------------------------------------
-- A CHECK constraint cannot look at another table, so a trigger does it.
CREATE OR REPLACE FUNCTION fn_check_book_seller() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    PERFORM 1 FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = NEW.seller_id AND r.role_name = 'seller';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user % is not a seller and cannot own books', NEW.seller_id USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_books_seller_role
    BEFORE INSERT OR UPDATE OF seller_id ON books
    FOR EACH ROW EXECUTE FUNCTION fn_check_book_seller();

-- 3. cart quantity cannot exceed what is in stock ------------------------
CREATE OR REPLACE FUNCTION fn_check_cart_quantity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_stock  INT;
    v_status TEXT;
    v_title  TEXT;
BEGIN
    SELECT stock, status, title INTO v_stock, v_status, v_title FROM books WHERE book_id = NEW.book_id;
    IF v_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'this book is not available for purchase' USING ERRCODE = '55000';
    END IF;
    IF NEW.quantity > v_stock THEN
        RAISE EXCEPTION 'only % cop% of "%" in stock', v_stock,
               CASE WHEN v_stock = 1 THEN 'y' ELSE 'ies' END, v_title USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_cart_quantity
    BEFORE INSERT OR UPDATE OF quantity ON cart_items
    FOR EACH ROW EXECUTE FUNCTION fn_check_cart_quantity();

-- 4. an order line deducts stock and logs the movement -------------------
-- If stock would go negative, ck_book_stock fails and the whole order rolls back.
CREATE OR REPLACE FUNCTION fn_order_item_take_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    UPDATE books SET stock = stock - NEW.quantity WHERE book_id = NEW.book_id;
    INSERT INTO stock_movements (book_id, delta, reason, order_item_id, created_by)
    VALUES (NEW.book_id, -NEW.quantity, 'order', NEW.order_item_id, app_user_id());
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_order_items_take_stock
    AFTER INSERT ON order_items
    FOR EACH ROW EXECUTE FUNCTION fn_order_item_take_stock();

-- 5. fulfilment status may only move forward along the allowed path -------
--    Placed -> Packed -> Shipped -> Delivered      (Cancelled only from Placed/Packed)
CREATE OR REPLACE FUNCTION fn_guard_item_status() RETURNS trigger
LANGUAGE plpgsql AS
$$
BEGIN
    IF OLD.fulfilment_status = NEW.fulfilment_status THEN
        RETURN NEW;
    END IF;
    IF NOT (   (OLD.fulfilment_status = 'Placed'  AND NEW.fulfilment_status IN ('Packed', 'Cancelled'))
            OR (OLD.fulfilment_status = 'Packed'  AND NEW.fulfilment_status IN ('Shipped', 'Cancelled'))
            OR (OLD.fulfilment_status = 'Shipped' AND NEW.fulfilment_status = 'Delivered')) THEN
        RAISE EXCEPTION 'illegal status change % -> %', OLD.fulfilment_status, NEW.fulfilment_status
              USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_order_items_status_guard
    BEFORE UPDATE OF fulfilment_status ON order_items
    FOR EACH ROW EXECUTE FUNCTION fn_guard_item_status();

-- 6. after a status change: restock if cancelled, then roll the status up to the order
CREATE OR REPLACE FUNCTION fn_order_item_status_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_total INT; v_cancelled INT; v_delivered INT; v_started INT; v_new TEXT;
BEGIN
    IF NEW.fulfilment_status = 'Cancelled' THEN
        UPDATE books SET stock = stock + NEW.quantity WHERE book_id = NEW.book_id;
        INSERT INTO stock_movements (book_id, delta, reason, order_item_id, created_by)
        VALUES (NEW.book_id, NEW.quantity, 'cancel', NEW.order_item_id, app_user_id());
    END IF;

    SELECT count(*),
           count(*) FILTER (WHERE fulfilment_status = 'Cancelled'),
           count(*) FILTER (WHERE fulfilment_status = 'Delivered'),
           count(*) FILTER (WHERE fulfilment_status IN ('Packed', 'Shipped', 'Delivered'))
      INTO v_total, v_cancelled, v_delivered, v_started
      FROM order_items WHERE order_id = NEW.order_id;

    v_new := CASE WHEN v_cancelled = v_total                 THEN 'Cancelled'
                  WHEN v_delivered + v_cancelled = v_total   THEN 'Delivered'
                  WHEN v_started > 0                         THEN 'InProgress'
                  ELSE 'Placed' END;

    UPDATE orders
       SET status = v_new,
           cancelled_at = CASE WHEN v_new = 'Cancelled' THEN now() ELSE cancelled_at END
     WHERE order_id = NEW.order_id AND status IS DISTINCT FROM v_new;
    RETURN NULL;
END
$$;

CREATE TRIGGER trg_order_items_status_changed
    AFTER UPDATE OF fulfilment_status ON order_items
    FOR EACH ROW
    WHEN (OLD.fulfilment_status IS DISTINCT FROM NEW.fulfilment_status)
    EXECUTE FUNCTION fn_order_item_status_changed();

-- 7. audit trail for sensitive changes -----------------------------------
-- (who moderated a book / suspended a user / changed a price, with before & after)
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_old JSONB := to_jsonb(OLD) - 'password_hash' - 'search_vector';
    v_new JSONB := to_jsonb(NEW) - 'password_hash' - 'search_vector';
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, actor_id)
    VALUES (TG_TABLE_NAME, (v_new ->> TG_ARGV[0])::bigint, TG_OP, v_old, v_new, app_user_id());
    RETURN NULL;
END
$$;

CREATE TRIGGER trg_audit_books
    AFTER UPDATE ON books FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.price_cents IS DISTINCT FROM NEW.price_cents)
    EXECUTE FUNCTION fn_audit_row('book_id');

CREATE TRIGGER trg_audit_users
    AFTER UPDATE ON users FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.role_id IS DISTINCT FROM NEW.role_id)
    EXECUTE FUNCTION fn_audit_row('user_id');
