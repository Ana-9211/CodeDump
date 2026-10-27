-- =====================================================================
-- 01_schema.sql : tables, keys, constraints and indexes  (PostgreSQL 15+)
-- Online Bookstore - DBMS Experiential Learning Level 3 mini-project
-- Author: Anagha N (PES1UG24CS058)
--
-- Design rules followed
--   * every table has a primary key; relationships use foreign keys with an
--     explicit ON DELETE rule chosen on purpose (CASCADE vs RESTRICT)
--   * money is stored as integer paise (price_cents) - never floating point
--   * business rules live in the database as CHECK / UNIQUE / partial indexes,
--     so a buggy API cannot store bad data
--   * order history stores *snapshots* of title/price/address so old orders
--     never change when a book or address is edited later
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive text for e-mail

-- ---------------------------------------------------------------------
-- 1. Lookup + identity
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    role_id    SMALLINT    PRIMARY KEY,
    role_name  VARCHAR(20) NOT NULL UNIQUE
               CONSTRAINT ck_role_name CHECK (role_name IN ('customer','seller','admin'))
);

CREATE TABLE users (
    user_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               VARCHAR(100) NOT NULL
                       CONSTRAINT ck_user_name CHECK (length(btrim(name)) > 0),
    email              CITEXT       NOT NULL UNIQUE
                       CONSTRAINT ck_user_email CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    password_hash      TEXT         NOT NULL,
    role_id            SMALLINT     NOT NULL REFERENCES roles(role_id)
                       ON UPDATE CASCADE ON DELETE RESTRICT,
    status             VARCHAR(10)  NOT NULL DEFAULT 'active'
                       CONSTRAINT ck_user_status CHECK (status IN ('active','suspended')),
    phone              VARCHAR(15)
                       CONSTRAINT ck_user_phone CHECK (phone IS NULL OR phone ~ '^[0-9+ -]{7,15}$'),
    failed_login_count INT          NOT NULL DEFAULT 0
                       CONSTRAINT ck_failed_login CHECK (failed_login_count >= 0),
    locked_until       TIMESTAMPTZ,
    email_verified_at  TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_users_role_status ON users (role_id, status);

-- 1:1 extension of users for sellers
CREATE TABLE seller_profiles (
    user_id     BIGINT       PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    store_name  VARCHAR(80)  NOT NULL UNIQUE
                CONSTRAINT ck_store_name CHECK (length(btrim(store_name)) > 0),
    description TEXT         NOT NULL DEFAULT ''
                CONSTRAINT ck_store_desc CHECK (length(description) <= 1000)
);

CREATE TABLE addresses (
    address_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    label       VARCHAR(30)  NOT NULL DEFAULT 'Home',
    full_name   VARCHAR(100) NOT NULL,
    line1       VARCHAR(150) NOT NULL,
    line2       VARCHAR(150),
    city        VARCHAR(80)  NOT NULL,
    state       VARCHAR(80)  NOT NULL,
    postal_code VARCHAR(12)  NOT NULL
                CONSTRAINT ck_postal CHECK (postal_code ~ '^[A-Za-z0-9 -]{3,12}$'),
    country     VARCHAR(60)  NOT NULL DEFAULT 'India',
    phone       VARCHAR(15)  NOT NULL
                CONSTRAINT ck_addr_phone CHECK (phone ~ '^[0-9+ -]{7,15}$'),
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_addresses_user ON addresses (user_id);
-- at most ONE default address per user (partial unique index)
CREATE UNIQUE INDEX uq_addresses_one_default ON addresses (user_id) WHERE is_default;

-- ---------------------------------------------------------------------
-- 2. Catalogue
-- ---------------------------------------------------------------------
-- Self-referencing table = a tree (Fiction -> Fantasy). Queried with a recursive CTE.
CREATE TABLE categories (
    category_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(80) NOT NULL,
    parent_id   INT REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT ck_category_not_own_parent CHECK (parent_id IS NULL OR parent_id <> category_id),
    -- NULLS NOT DISTINCT (PG15+): two root categories may not share a name either
    CONSTRAINT uq_category_name_per_parent UNIQUE NULLS NOT DISTINCT (parent_id, name)
);
CREATE INDEX ix_categories_parent ON categories (parent_id);

CREATE TABLE authors (
    author_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      VARCHAR(150) NOT NULL UNIQUE
              CONSTRAINT ck_author_name CHECK (length(btrim(name)) > 0)
);

CREATE TABLE books (
    book_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_id           BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    category_id         INT          NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    isbn                VARCHAR(13)  NOT NULL
                        CONSTRAINT ck_isbn CHECK (isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'),
    title               VARCHAR(200) NOT NULL
                        CONSTRAINT ck_book_title CHECK (length(btrim(title)) > 0),
    description         TEXT         NOT NULL DEFAULT ''
                        CONSTRAINT ck_book_desc CHECK (length(description) <= 5000),
    language            VARCHAR(30)  NOT NULL DEFAULT 'English',
    cover_url           VARCHAR(300)
                        CONSTRAINT ck_cover_url CHECK (cover_url IS NULL OR cover_url ~* '^https?://[^[:space:]]+$'),
    price_cents         INT          NOT NULL CONSTRAINT ck_book_price CHECK (price_cents > 0),
    stock               INT          NOT NULL DEFAULT 0 CONSTRAINT ck_book_stock CHECK (stock >= 0),
    low_stock_threshold INT          NOT NULL DEFAULT 5 CONSTRAINT ck_book_low CHECK (low_stock_threshold >= 0),
    status              VARCHAR(10)  NOT NULL DEFAULT 'pending'
                        CONSTRAINT ck_book_status CHECK (status IN ('pending','approved','rejected','removed')),
    rejection_reason    TEXT,
    -- summary columns kept in step with the NoSQL review collection (see sp_set_rating_summary)
    avg_rating          NUMERIC(3,2) NOT NULL DEFAULT 0 CONSTRAINT ck_avg_rating CHECK (avg_rating BETWEEN 0 AND 5),
    review_count        INT          NOT NULL DEFAULT 0 CONSTRAINT ck_review_count CHECK (review_count >= 0),
    search_vector       TSVECTOR GENERATED ALWAYS AS (
                          to_tsvector('english'::regconfig, coalesce(title,'') || ' ' || coalesce(description,''))
                        ) STORED,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_book_seller_isbn UNIQUE (seller_id, isbn),
    CONSTRAINT ck_rejection_needs_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
CREATE INDEX ix_books_browse   ON books (status, category_id, price_cents);
CREATE INDEX ix_books_newest   ON books (status, created_at DESC);
CREATE INDEX ix_books_seller   ON books (seller_id, status);
CREATE INDEX ix_books_fts      ON books USING GIN (search_vector);
CREATE INDEX ix_books_title    ON books (lower(title) text_pattern_ops);

-- many-to-many: a book can have several authors, an author several books
CREATE TABLE book_authors (
    book_id      BIGINT   NOT NULL REFERENCES books(book_id)     ON DELETE CASCADE,
    author_id    INT      NOT NULL REFERENCES authors(author_id) ON DELETE RESTRICT,
    author_order SMALLINT NOT NULL DEFAULT 1 CONSTRAINT ck_author_order CHECK (author_order > 0),
    PRIMARY KEY (book_id, author_id),
    CONSTRAINT uq_book_author_order UNIQUE (book_id, author_order)
);
CREATE INDEX ix_book_authors_author ON book_authors (author_id);

-- ---------------------------------------------------------------------
-- 3. Cart, orders, payments
-- ---------------------------------------------------------------------
CREATE TABLE cart_items (
    user_id  BIGINT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    book_id  BIGINT      NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    quantity INT         NOT NULL CONSTRAINT ck_cart_qty CHECK (quantity BETWEEN 1 AND 10),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, book_id)            -- composite key: one row per book per user
);

CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
    order_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_number     VARCHAR(20) NOT NULL UNIQUE
                     DEFAULT ('BK' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 5, '0')),
    user_id          BIGINT      NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status           VARCHAR(10) NOT NULL DEFAULT 'Placed'
                     CONSTRAINT ck_order_status CHECK (status IN ('Placed','InProgress','Delivered','Cancelled')),
    -- shipping address SNAPSHOT (copied, not referenced, so history is frozen)
    ship_full_name   VARCHAR(100) NOT NULL,
    ship_line1       VARCHAR(150) NOT NULL,
    ship_line2       VARCHAR(150),
    ship_city        VARCHAR(80)  NOT NULL,
    ship_state       VARCHAR(80)  NOT NULL,
    ship_postal_code VARCHAR(12)  NOT NULL,
    ship_country     VARCHAR(60)  NOT NULL,
    ship_phone       VARCHAR(15)  NOT NULL,
    subtotal_cents   INT NOT NULL CONSTRAINT ck_sub  CHECK (subtotal_cents >= 0),
    tax_cents        INT NOT NULL CONSTRAINT ck_tax  CHECK (tax_cents >= 0),
    shipping_cents   INT NOT NULL CONSTRAINT ck_ship CHECK (shipping_cents >= 0),
    total_cents      INT NOT NULL,
    placed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_total CHECK (total_cents = subtotal_cents + tax_cents + shipping_cents)
);
CREATE INDEX ix_orders_user   ON orders (user_id, placed_at DESC);
CREATE INDEX ix_orders_status ON orders (status, placed_at DESC);

CREATE TABLE order_items (
    order_item_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id          BIGINT       NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    book_id           BIGINT       NOT NULL REFERENCES books(book_id)   ON DELETE RESTRICT,
    seller_id         BIGINT       NOT NULL REFERENCES users(user_id)   ON DELETE RESTRICT,
    title_snapshot    VARCHAR(200) NOT NULL,
    isbn_snapshot     VARCHAR(13)  NOT NULL,
    unit_price_cents  INT          NOT NULL CONSTRAINT ck_item_price CHECK (unit_price_cents > 0),
    quantity          INT          NOT NULL CONSTRAINT ck_item_qty   CHECK (quantity BETWEEN 1 AND 10),
    line_total_cents  INT          NOT NULL,
    fulfilment_status VARCHAR(10)  NOT NULL DEFAULT 'Placed'
                      CONSTRAINT ck_fulfilment CHECK (fulfilment_status IN ('Placed','Packed','Shipped','Delivered','Cancelled')),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_line_total CHECK (line_total_cents = unit_price_cents * quantity),
    CONSTRAINT uq_order_book UNIQUE (order_id, book_id)
);
CREATE INDEX ix_order_items_order  ON order_items (order_id);
CREATE INDEX ix_order_items_seller ON order_items (seller_id, fulfilment_status);
CREATE INDEX ix_order_items_book   ON order_items (book_id);

-- 1:1 with orders
CREATE TABLE payments (
    payment_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id        BIGINT      NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
    method          VARCHAR(10) NOT NULL CONSTRAINT ck_pay_method CHECK (method IN ('card','upi','cod')),
    amount_cents    INT         NOT NULL CONSTRAINT ck_pay_amount CHECK (amount_cents > 0),
    status          VARCHAR(10) NOT NULL CONSTRAINT ck_pay_status CHECK (status IN ('Paid','Pending','Refunded','Void')),
    transaction_ref VARCHAR(40) NOT NULL UNIQUE
                    DEFAULT ('TXN' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12))),
    paid_at         TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 4. Operations tables filled automatically by triggers / procedures
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
    movement_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_id       BIGINT      NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    delta         INT         NOT NULL CONSTRAINT ck_delta_nonzero CHECK (delta <> 0),
    reason        VARCHAR(12) NOT NULL CONSTRAINT ck_move_reason CHECK (reason IN ('order','cancel','restock','adjustment')),
    order_item_id BIGINT      REFERENCES order_items(order_item_id) ON DELETE SET NULL,
    created_by    BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_stock_movements_book ON stock_movements (book_id, created_at DESC);

CREATE TABLE audit_log (
    audit_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name VARCHAR(40) NOT NULL,
    record_id  BIGINT      NOT NULL,
    action     VARCHAR(10) NOT NULL,
    old_data   JSONB,
    new_data   JSONB,
    actor_id   BIGINT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_table_record ON audit_log (table_name, record_id, changed_at DESC);

-- tunable business constants (tax %, shipping fee ...) read by functions
CREATE TABLE app_settings (
    setting_key   VARCHAR(40) PRIMARY KEY,
    setting_value INT         NOT NULL CONSTRAINT ck_setting_nonneg CHECK (setting_value >= 0),
    description   TEXT        NOT NULL DEFAULT ''
);
