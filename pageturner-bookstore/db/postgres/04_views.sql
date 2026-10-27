-- =====================================================================
-- 04_views.sql : read models used by the API
-- WITH (security_invoker = true) makes a view run with the CALLER's privileges,
-- so Row Level Security on the base tables still applies per role.
-- =====================================================================

-- Catalogue card: book + category + store + comma-joined authors (M:N flattened)
CREATE OR REPLACE VIEW v_book_catalog WITH (security_invoker = true) AS
SELECT b.book_id, b.title, b.isbn, b.description, b.language,
       b.cover_url, b.low_stock_threshold, b.price_cents, b.stock, b.status, b.rejection_reason, b.avg_rating, b.review_count, b.created_at,
       b.category_id, c.name AS category_name,
       b.seller_id, sp.store_name,
       COALESCE(string_agg(a.name, ', ' ORDER BY ba.author_order), '') AS authors,
       b.search_vector
  FROM books b
  JOIN categories c            ON c.category_id = b.category_id
  LEFT JOIN seller_profiles sp ON sp.user_id    = b.seller_id
  LEFT JOIN book_authors ba    ON ba.book_id    = b.book_id
  LEFT JOIN authors a          ON a.author_id   = ba.author_id
 GROUP BY b.book_id, c.category_id, sp.user_id;

-- A seller's own books that need restocking
CREATE OR REPLACE VIEW v_low_stock WITH (security_invoker = true) AS
SELECT book_id, title, stock, low_stock_threshold
  FROM books
 WHERE seller_id = app_user_id()
   AND status = 'approved'
   AND stock <= low_stock_threshold;

-- Order header + customer + payment (customers and admins only; sellers cannot see payments)
CREATE OR REPLACE VIEW v_order_overview WITH (security_invoker = true) AS
SELECT o.order_id, o.order_number, o.status, o.placed_at, o.total_cents,
       u.name AS customer_name, u.email AS customer_email,
       p.method AS payment_method, p.status AS payment_status,
       (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS line_count
  FROM orders o
  JOIN users u         ON u.user_id  = o.user_id
  LEFT JOIN payments p ON p.order_id = o.order_id;

-- CTE + window function ranking sellers by revenue (admin dashboard)
CREATE OR REPLACE VIEW v_seller_performance WITH (security_invoker = true) AS
WITH sales AS (
    SELECT oi.seller_id,
           count(DISTINCT oi.order_id)  AS orders_count,
           sum(oi.quantity)             AS units,
           sum(oi.line_total_cents)     AS revenue_cents
      FROM order_items oi
     WHERE oi.fulfilment_status <> 'Cancelled'
     GROUP BY oi.seller_id
)
SELECT sp.user_id AS seller_id, sp.store_name,
       COALESCE(s.orders_count, 0)   AS orders_count,
       COALESCE(s.units, 0)          AS units,
       COALESCE(s.revenue_cents, 0)  AS revenue_cents,
       RANK() OVER (ORDER BY COALESCE(s.revenue_cents, 0) DESC) AS revenue_rank
  FROM seller_profiles sp
  LEFT JOIN sales s ON s.seller_id = sp.user_id;
