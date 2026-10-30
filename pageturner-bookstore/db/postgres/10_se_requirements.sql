-- =====================================================================
-- 10_se_requirements.sql : rules required by the Software Engineering SRS
--   FR-01  e-mail verification link        FR-14  confirmation e-mail within 60 s (outbox)
--   FR-21  alert the seller when stock falls to their own threshold
-- =====================================================================

-- ---------- FR-01 e-mail verification (only the hash of the token is stored) ----------
CREATE TABLE email_verifications (
    token_hash CHAR(64)    PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_email_verifications_user ON email_verifications (user_id);

CREATE OR REPLACE FUNCTION fn_create_email_verification(p_user BIGINT, p_token_hash TEXT)
RETURNS TABLE (email TEXT, name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    UPDATE email_verifications ev SET used_at = now() WHERE ev.user_id = p_user AND ev.used_at IS NULL;   -- older links die
    INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (p_token_hash, p_user, now() + interval '24 hours');
    RETURN QUERY SELECT u.email::text, u.name::text FROM users u WHERE u.user_id = p_user AND u.email_verified_at IS NULL;
END
$$;

CREATE OR REPLACE FUNCTION fn_verify_email(p_token_hash TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE v_user BIGINT;
BEGIN
    UPDATE email_verifications SET used_at = now()
     WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
    RETURNING email_verifications.user_id INTO v_user;
    IF v_user IS NULL THEN RETURN false; END IF;
    UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE user_id = v_user;
    RETURN true;
END
$$;

-- ---------- FR-14 e-mail outbox: notifications are queued by triggers, a mailer sends them ----------
CREATE OR REPLACE FUNCTION fn_pending_emails(p_limit INT DEFAULT 20)
RETURNS TABLE (notification_id BIGINT, to_email TEXT, to_name TEXT, subject TEXT, body TEXT, link TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
    SELECT n.notification_id, u.email::text, u.name::text, n.subject::text, n.body, n.link::text
      FROM notifications n JOIN users u ON u.user_id = n.user_id
     WHERE n.email_status = 'queued'
     ORDER BY n.notification_id
     LIMIT LEAST(GREATEST(p_limit, 1), 100)
$$;

CREATE OR REPLACE FUNCTION fn_mark_email(p_id BIGINT, p_status TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
$$ UPDATE notifications SET email_status = p_status WHERE notification_id = p_id AND p_status IN ('sent', 'failed') $$;

-- ---------- FR-21 low-stock alert for the seller ----------
-- Fires once when stock CROSSES down to the seller's threshold (not on every later sale).
CREATE OR REPLACE FUNCTION trg_low_stock_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
    IF NEW.status = 'approved' AND NEW.stock <= NEW.low_stock_threshold AND OLD.stock > OLD.low_stock_threshold THEN
        PERFORM fn_notify(NEW.seller_id, 'low_stock',
                          CASE WHEN NEW.stock = 0 THEN '“' || NEW.title || '” is out of stock'
                               ELSE '“' || NEW.title || '” is running low (' || NEW.stock || ' left)' END,
                          'Your alert level for this book is ' || NEW.low_stock_threshold || '. Restock to keep selling.', '/seller');
    END IF;
    RETURN NULL;
END
$$;
CREATE TRIGGER trg_books_low_stock AFTER UPDATE OF stock ON books FOR EACH ROW EXECUTE FUNCTION trg_low_stock_alert();

REVOKE ALL ON FUNCTION fn_create_email_verification(BIGINT, TEXT), fn_verify_email(TEXT), fn_pending_emails(INT),
       fn_mark_email(BIGINT, TEXT), trg_low_stock_alert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_create_email_verification(BIGINT, TEXT), fn_verify_email(TEXT),
       fn_pending_emails(INT), fn_mark_email(BIGINT, TEXT) TO bookstore_app;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;      -- no policy, no grant: reachable only through the routines
