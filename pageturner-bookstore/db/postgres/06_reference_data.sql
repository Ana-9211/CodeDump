-- =====================================================================
-- 06_reference_data.sql : rows the system cannot run without
-- (role names, business constants, the category tree)
-- =====================================================================

INSERT INTO roles (role_id, role_name) VALUES (1, 'customer'), (2, 'seller'), (3, 'admin');

INSERT INTO app_settings (setting_key, setting_value, description) VALUES
    ('tax_rate_percent',             5,     'GST-style tax charged on the subtotal (%)'),
    ('shipping_flat_cents',          4900,  'Flat shipping fee in paise when below the free-shipping threshold'),
    ('free_shipping_threshold_cents',49900, 'Subtotal (paise) at or above which shipping is free'),
    ('max_failed_logins',            5,     'Failed logins before the account is temporarily locked'),
    ('lockout_minutes',              15,    'How long a locked account stays locked');

-- Level 1 (roots)
INSERT INTO categories (name, parent_id) VALUES
    ('Fiction', NULL), ('Non-Fiction', NULL), ('Academic', NULL), ('Children', NULL);

-- Level 2
INSERT INTO categories (name, parent_id)
SELECT v.name, p.category_id
  FROM (VALUES ('Fantasy','Fiction'), ('Science Fiction','Fiction'), ('Mystery & Thriller','Fiction'),
               ('Classics','Fiction'), ('Science','Non-Fiction'), ('Biography & Memoir','Non-Fiction'),
               ('Self-Help','Non-Fiction'), ('Engineering','Academic'), ('Mathematics','Academic'))
       AS v(name, parent)
  JOIN categories p ON p.name = v.parent AND p.parent_id IS NULL;

-- Level 3
INSERT INTO categories (name, parent_id)
SELECT v.name, p.category_id
  FROM (VALUES ('Physics','Science'), ('Computer Science','Science')) AS v(name, parent)
  JOIN categories p ON p.name = v.parent;
