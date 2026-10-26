-- =====================================================================
-- 09_audit_more.sql : audit trail for category and setting changes
-- fn_audit_row (03_triggers.sql) only handles UPDATE rows that have a numeric key.
-- This variant also handles INSERT and DELETE, and rows keyed by text (app_settings).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
    v_old JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    v_new JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
    v_key TEXT  := COALESCE(v_new, v_old) ->> TG_ARGV[0];
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, actor_id)
    VALUES (TG_TABLE_NAME,
            CASE WHEN v_key ~ '^[0-9]+$' THEN v_key::bigint ELSE 0 END,   -- text keys stay readable inside old/new data
            TG_OP, v_old, v_new, app_user_id());
    RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION fn_audit_change() FROM PUBLIC;

CREATE TRIGGER trg_audit_categories
    AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH ROW
    EXECUTE FUNCTION fn_audit_change('category_id');

CREATE TRIGGER trg_audit_settings
    AFTER UPDATE ON app_settings FOR EACH ROW
    WHEN (OLD.setting_value IS DISTINCT FROM NEW.setting_value)
    EXECUTE FUNCTION fn_audit_change('setting_key');
