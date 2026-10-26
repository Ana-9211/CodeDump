-- =====================================================================
-- 00_roles.sql : cluster-level roles used for database-enforced RBAC
-- Run once as a superuser (the setup script does this for you).
--
-- Analogy: think of the database as a bookshop building.
--   bookstore_app      = the shop's front door key card. It can open the door
--                        but by itself it cannot walk into any room.
--   bookstore_guest    = a visitor browsing the shelves
--   bookstore_customer = a member with a basket and an order history
--   bookstore_seller   = a stall holder who manages only their own stock
--   bookstore_admin    = the manager with the master key
-- The web app logs in as bookstore_app and, for every request, steps into
-- exactly one of the four role "rooms" with SET LOCAL ROLE.
-- =====================================================================

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['bookstore_guest','bookstore_customer','bookstore_seller','bookstore_admin']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bookstore_app') THEN
    -- CHANGE THIS PASSWORD outside local development (APP_DB_PASSWORD in .env)
    CREATE ROLE bookstore_app LOGIN PASSWORD 'bookstore_app_pw';
  END IF;
END $$;

-- NOINHERIT: bookstore_app does NOT automatically receive the privileges of the
-- four roles; it has to explicitly SET ROLE into one of them. If the app ever
-- forgot to switch role it would see nothing instead of everything.
ALTER ROLE bookstore_app NOINHERIT;

GRANT bookstore_guest, bookstore_customer, bookstore_seller, bookstore_admin TO bookstore_app;
