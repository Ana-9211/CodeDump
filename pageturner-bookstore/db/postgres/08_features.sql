-- =====================================================================
-- 08_features.sql : features that came from the Software Engineering backlog
--   FR-03 password reset      FR-10 wishlist           FR-14 order notifications
--   FR-18 profile + max 5 addresses                    FR-19/25 seller application workflow
--   FR-26 category management (admin)
-- Same recipe as before: constraints in the tables, rules in routines/triggers,
-- and GRANT + Row Level Security so each role sees only its own slice.
-- =====================================================================

-- ---------- FR-10 wishlist: users <-> books is many-to-many ------------
CREATE TABLE wishlist_items (
    user_id  BIGINT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    book_id  BIGINT      NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id)            -- composite key: a book can be saved once per user
);

-- ---------- FR-19/25 seller applications -------------------------------
CREATE TABLE seller_applications (
    application_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    store_name     VARCHAR(80)  NOT NULL CONSTRAINT ck_app_store CHECK (length(btrim(store_name)) > 0),
    reason         VARCHAR(500) NOT NULL DEFAULT '',
    status         VARCHAR(10)  NOT NULL DEFAULT 'pending'
                   CONSTRAINT ck_app_status CHECK (status IN ('pending','approved','rejected')),
    review_note    VARCHAR(300),
    decided_by     BIGINT       REFERENCES users(user_id),
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_app_decided CHECK ((status = 'pending') = (decided_at IS NULL))
);
-- partial unique index: at most ONE pending application per person
CREATE UNIQUE INDEX uq_one_pending_application ON seller_applications (user_id) WHERE status = 'pending';

-- ---------- FR-03 password reset tokens (only the hash is stored) ------
CREATE TABLE password_resets (
    token_hash CHAR(64)    PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_password_resets_user ON password_resets (user_id);

-- ---------- FR-14 notifications / e-mail outbox ------------------------
CREATE TABLE notifications (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kind            VARCHAR(30)  NOT NULL,
    subject         VARCHAR(150) NOT NULL,
    body            TEXT         NOT NULL DEFAULT '',
    link            VARCHAR(200),
    email_status    VARCHAR(10)  NOT NULL DEFAULT 'queued'
                    CONSTRAINT ck_notif_email CHECK (email_status IN ('queued','sent','failed')),
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_notify(p_user BIGINT, p_kind TEXT, p_subject TEXT, p_body TEXT, p_link TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
$$ INSERT INTO notifications (user_id, kind, subject, body, link) VALUES (p_user, p_kind, p_subject, p_body, p_link) $$;

CREATE OR REPLACE FUNCTION trg_notify_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM fn_notify(NEW.user_id, 'order_placed', 'Order ' || NEW.order_number || ' confirmed',
                          'Thank you! We received your order and will start packing it soon.', '/orders/' || NEW.order_id);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM fn_notify(NEW.user_id, 'order_status', 'Order ' || NEW.order_number || ' is now ' || NEW.status,
                          'Status changed from ' || OLD.status || ' to ' || NEW.status || '.', '/orders/' || NEW.order_id);
    END IF;
    RETURN NULL;
END
$$;
CREATE TRIGGER trg_orders_notify_ins AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION trg_notify_order();
CREATE TRIGGER trg_orders_notify_upd AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION trg_notify_order();

-- tell a seller when an administrator approves / rejects one of their books
CREATE OR REPLACE FUNCTION trg_notify_book_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    IF NEW.status = 'approved' AND OLD.status IN ('pending', 'rejected') THEN
        PERFORM fn_notify(NEW.seller_id, 'book_approved', '“' || NEW.title || '” is live', 'An administrator approved your listing.', '/seller');
    ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
        PERFORM fn_notify(NEW.seller_id, 'book_rejected', '“' || NEW.title || '” was rejected', COALESCE(NEW.rejection_reason, ''), '/seller');
    END IF;
    RETURN NULL;
END
$$;
CREATE TRIGGER trg_books_notify AFTER UPDATE OF status ON books FOR EACH ROW EXECUTE FUNCTION trg_notify_book_review();

-- FR-18: a user may keep at most 5 saved addresses
CREATE OR REPLACE FUNCTION trg_limit_addresses() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    IF (SELECT count(*) FROM addresses WHERE user_id = NEW.user_id) >= 5 THEN
        RAISE EXCEPTION 'you can save at most 5 addresses' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER trg_addresses_limit BEFORE INSERT ON addresses FOR EACH ROW EXECUTE FUNCTION trg_limit_addresses();

CREATE TRIGGER trg_audit_applications
    AFTER UPDATE ON seller_applications FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fn_audit_row('application_id');

-- ---------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------
-- A customer asks to become a seller
CREATE OR REPLACE FUNCTION fn_apply_seller(p_store TEXT, p_reason TEXT) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_user BIGINT := fn_require_role('customer'); v_id BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM seller_profiles WHERE lower(store_name) = lower(btrim(p_store))) THEN
        RAISE EXCEPTION 'that store name is already taken' USING ERRCODE = '23505';
    END IF;
    INSERT INTO seller_applications (user_id, store_name, reason) VALUES (v_user, btrim(p_store), COALESCE(btrim(p_reason), ''))
    RETURNING application_id INTO v_id;
    RETURN v_id;
END
$$;

-- An administrator approves (promotes the customer to seller) or rejects
CREATE OR REPLACE FUNCTION fn_decide_seller_application(p_id BIGINT, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_admin BIGINT := fn_require_role('admin'); a seller_applications%ROWTYPE;
BEGIN
    SELECT * INTO a FROM seller_applications WHERE application_id = p_id AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'application not found or already decided' USING ERRCODE = 'P0002';
    END IF;
    IF p_approve THEN
        UPDATE users SET role_id = (SELECT role_id FROM roles WHERE role_name = 'seller') WHERE user_id = a.user_id AND role_id = (SELECT role_id FROM roles WHERE role_name = 'customer');
        INSERT INTO seller_profiles (user_id, store_name) VALUES (a.user_id, a.store_name) ON CONFLICT (user_id) DO NOTHING;
        DELETE FROM cart_items WHERE user_id = a.user_id;
    END IF;
    UPDATE seller_applications
       SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
           review_note = NULLIF(btrim(p_note), ''), decided_by = v_admin, decided_at = now()
     WHERE application_id = p_id;
    PERFORM fn_notify(a.user_id, CASE WHEN p_approve THEN 'seller_approved' ELSE 'seller_rejected' END,
                      CASE WHEN p_approve THEN 'You are now a seller!' ELSE 'Seller application not approved' END,
                      COALESCE(NULLIF(btrim(p_note), ''), ''), CASE WHEN p_approve THEN '/seller' END);
END
$$;

-- Password reset: store only a SHA-256 hash of the token the user receives
CREATE OR REPLACE FUNCTION fn_create_password_reset(p_email TEXT, p_token_hash TEXT)
RETURNS TABLE (user_id BIGINT, name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_user BIGINT; v_name TEXT;
BEGIN
    SELECT u.user_id, u.name::text INTO v_user, v_name FROM users u WHERE u.email = p_email AND u.status = 'active';
    IF v_user IS NULL THEN RETURN; END IF;
    UPDATE password_resets pr SET used_at = now() WHERE pr.user_id = v_user AND pr.used_at IS NULL;   -- old links die
    INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (p_token_hash, v_user, now() + interval '30 minutes');
    PERFORM fn_notify(v_user, 'password_reset', 'Password reset requested', 'If this was not you, ignore the e-mail; your password is unchanged.');
    RETURN QUERY SELECT v_user, v_name;
END
$$;

CREATE OR REPLACE FUNCTION fn_reset_password(p_token_hash TEXT, p_new_hash TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_user BIGINT;
BEGIN
    UPDATE password_resets SET used_at = now()
     WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
    RETURNING password_resets.user_id INTO v_user;
    IF v_user IS NULL THEN RETURN false; END IF;
    UPDATE users SET password_hash = p_new_hash, failed_login_count = 0, locked_until = NULL WHERE user_id = v_user;
    RETURN true;
END
$$;

-- Logged-in user changes own password (API verifies the old one with bcrypt first)
CREATE OR REPLACE FUNCTION fn_get_own_hash() RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_id BIGINT := app_user_id(); h TEXT;
BEGIN
    IF v_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
    SELECT password_hash INTO h FROM users WHERE user_id = v_id;
    RETURN h;
END
$$;
CREATE OR REPLACE FUNCTION fn_set_own_password(p_new_hash TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_id BIGINT := app_user_id();
BEGIN
    IF v_id IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
    UPDATE users SET password_hash = p_new_hash WHERE user_id = v_id;
END
$$;

-- Admin: category tree maintenance with friendly guards
CREATE OR REPLACE FUNCTION fn_delete_category(p_id INT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    PERFORM fn_require_role('admin');
    IF EXISTS (SELECT 1 FROM categories WHERE parent_id = p_id) THEN
        RAISE EXCEPTION 'move or delete the sub-categories first' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (SELECT 1 FROM books WHERE category_id = p_id) THEN
        RAISE EXCEPTION 'this category still has books' USING ERRCODE = '23503';
    END IF;
    DELETE FROM categories WHERE category_id = p_id;
END
$$;

-- ---------------------------------------------------------------------
-- Privileges + Row Level Security for the new tables
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION fn_notify(BIGINT, TEXT, TEXT, TEXT, TEXT), trg_notify_order(), trg_notify_book_review(), trg_limit_addresses(),
       fn_apply_seller(TEXT, TEXT), fn_decide_seller_application(BIGINT, BOOLEAN, TEXT),
       fn_create_password_reset(TEXT, TEXT), fn_reset_password(TEXT, TEXT),
       fn_get_own_hash(), fn_set_own_password(TEXT), fn_delete_category(INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_create_password_reset(TEXT, TEXT), fn_reset_password(TEXT, TEXT) TO bookstore_app;
GRANT EXECUTE ON FUNCTION fn_get_own_hash(), fn_set_own_password(TEXT) TO bookstore_customer, bookstore_seller, bookstore_admin;
GRANT EXECUTE ON FUNCTION fn_apply_seller(TEXT, TEXT) TO bookstore_customer;
GRANT EXECUTE ON FUNCTION fn_decide_seller_application(BIGINT, BOOLEAN, TEXT) TO bookstore_admin;
GRANT EXECUTE ON FUNCTION fn_delete_category(INT) TO bookstore_admin;

ALTER TABLE wishlist_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets     ENABLE ROW LEVEL SECURITY;      -- no policy + no grant: unreachable except via routines

GRANT SELECT, INSERT, DELETE ON wishlist_items TO bookstore_customer;
CREATE POLICY wish_own ON wishlist_items FOR ALL TO bookstore_customer
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

GRANT SELECT ON seller_applications TO bookstore_customer, bookstore_admin;
CREATE POLICY app_own   ON seller_applications FOR SELECT TO bookstore_customer USING (user_id = app_user_id());
CREATE POLICY app_admin ON seller_applications FOR SELECT TO bookstore_admin USING (true);

GRANT SELECT ON notifications TO bookstore_customer, bookstore_seller, bookstore_admin;
GRANT UPDATE (read_at) ON notifications TO bookstore_customer, bookstore_seller, bookstore_admin;
CREATE POLICY notif_own_sel ON notifications FOR SELECT TO bookstore_customer, bookstore_seller, bookstore_admin USING (user_id = app_user_id());
CREATE POLICY notif_own_upd ON notifications FOR UPDATE TO bookstore_customer, bookstore_seller, bookstore_admin
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- profile: a user may edit own name and phone (and nothing else) on their own row
GRANT UPDATE (name, phone) ON users TO bookstore_customer, bookstore_seller;
CREATE POLICY users_self_update ON users FOR UPDATE TO bookstore_customer, bookstore_seller
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- category maintenance
GRANT INSERT, UPDATE (name, parent_id) ON categories TO bookstore_admin;
