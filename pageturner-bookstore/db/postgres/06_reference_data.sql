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
    ('Portal Worlds', NULL), ('Fairy Tales & Retellings', NULL), ('Cozy Magic', NULL), ('Little Dreamers', NULL);

-- Level 2
INSERT INTO categories (name, parent_id)
SELECT v.name, p.category_id
  FROM (VALUES ('Wonderlands','Portal Worlds'), ('Funny Fantasy','Portal Worlds'), ('Dark Whimsy','Portal Worlds'),
               ('Timeless Tales','Portal Worlds'), ('Enchanted Lands','Fairy Tales & Retellings'),
               ('Myth Retold','Fairy Tales & Retellings'), ('Folk & Fable','Fairy Tales & Retellings'),
               ('Tea & Spells','Cozy Magic'), ('Witches & Wizards','Cozy Magic'))
       AS v(name, parent)
  JOIN categories p ON p.name = v.parent AND p.parent_id IS NULL;

-- Level 3
INSERT INTO categories (name, parent_id)
SELECT v.name, p.category_id
  FROM (VALUES ('Sky & Stars','Enchanted Lands'), ('Hidden Realms','Enchanted Lands')) AS v(name, parent)
  JOIN categories p ON p.name = v.parent;
