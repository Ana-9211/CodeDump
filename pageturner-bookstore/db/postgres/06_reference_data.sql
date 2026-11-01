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

-- Level 1 (roots): the genre tree has three levels, so the recursive-CTE queries have something to walk
INSERT INTO categories (name, parent_id) VALUES
    ('Fantasy', NULL), ('Children''s Fiction', NULL), ('Fairy Tales and Folklore', NULL), ('Young Adult', NULL);

-- Level 2
INSERT INTO categories (name, parent_id)
SELECT v.name, p.category_id
  FROM (VALUES ('Epic and High Fantasy','Fantasy'), ('Portal Fantasy','Fantasy'), ('Urban and Contemporary Fantasy','Fantasy'),
               ('Dark Fantasy','Fantasy'), ('Humorous Fantasy','Fantasy'), ('Cozy Fantasy','Fantasy'),
               ('Picture Books','Children''s Fiction'), ('Middle Grade','Children''s Fiction'), ('Classics','Children''s Fiction'),
               ('Retellings','Fairy Tales and Folklore'), ('Myths and Legends','Fairy Tales and Folklore'),
               ('Classic Fairy Tales','Fairy Tales and Folklore'),
               ('Young Adult Fantasy','Young Adult'))
       AS v(name, parent)
  JOIN categories p ON p.name = v.parent AND p.parent_id IS NULL;

-- Level 3
INSERT INTO categories (name, parent_id)
SELECT v.name, p.category_id
  FROM (VALUES ('Animal Stories','Middle Grade'), ('Adventure and Magic','Middle Grade'),
               ('Greek and Roman','Myths and Legends'), ('Norse','Myths and Legends')) AS v(name, parent)
  JOIN categories p ON p.name = v.parent;
