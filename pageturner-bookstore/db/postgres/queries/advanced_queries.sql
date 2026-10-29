-- =====================================================================
-- Nested, correlated, recursive, join and window queries
--   psql -d bookstore_dbms -f db/postgres/queries/advanced_queries.sql
-- Run `npm run db:seed` first so the shop has orders to analyse.
-- =====================================================================

\echo '--- 1. NESTED (subquery in WHERE): books priced above the average of their category'
SELECT b.title, c.name AS category, b.price_cents / 100.0 AS price
  FROM books b JOIN categories c USING (category_id)
 WHERE b.status = 'approved'
   AND b.price_cents > (SELECT avg(price_cents) FROM books WHERE category_id = b.category_id AND status = 'approved')
 ORDER BY c.name, price DESC LIMIT 10;

\echo '--- 2. NESTED with IN: customers who bought anything from "The Lantern Shelf"'
SELECT DISTINCT u.name FROM users u
 WHERE u.user_id IN (SELECT o.user_id FROM orders o JOIN order_items oi USING (order_id)
                      WHERE oi.seller_id = (SELECT user_id FROM seller_profiles WHERE store_name = 'The Lantern Shelf'));

\echo '--- 3. CORRELATED: the most expensive approved book of every category'
SELECT c.name, b.title, b.price_cents / 100.0 AS price
  FROM books b JOIN categories c USING (category_id)
 WHERE b.status = 'approved'
   AND b.price_cents = (SELECT max(b2.price_cents) FROM books b2 WHERE b2.category_id = b.category_id AND b2.status = 'approved')
 ORDER BY c.name;

\echo '--- 4. CORRELATED + EXISTS / NOT EXISTS: approved books nobody has ever ordered (dead stock)'
SELECT b.title, b.stock FROM books b
 WHERE b.status = 'approved'
   AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.book_id = b.book_id)
 ORDER BY b.stock DESC LIMIT 8;

\echo '--- 5. RECURSIVE CTE: the category tree with depth, path and books per sub-tree'
WITH RECURSIVE tree AS (
    SELECT category_id, name, parent_id, 0 AS depth, name::text AS path FROM categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.category_id, c.name, c.parent_id, t.depth + 1, t.path || ' > ' || c.name
      FROM categories c JOIN tree t ON c.parent_id = t.category_id
)
SELECT repeat('   ', depth) || name AS category, path,
       (SELECT count(*) FROM books b WHERE b.category_id = tree.category_id) AS direct_books
  FROM tree ORDER BY path;
\echo '    (the same logic is packaged as fn_category_tree())'
SELECT * FROM fn_category_tree();

\echo '--- 6. JOINS: INNER (order lines), LEFT (books with zero orders still appear), multi-table'
SELECT o.order_number, u.name AS customer, oi.title_snapshot AS book, sp.store_name, oi.quantity, oi.line_total_cents / 100.0 AS amount
  FROM orders o
  JOIN users u            ON u.user_id   = o.user_id
  JOIN order_items oi     ON oi.order_id = o.order_id
  JOIN seller_profiles sp ON sp.user_id  = oi.seller_id
 ORDER BY o.placed_at DESC LIMIT 8;

SELECT b.title, COALESCE(sum(oi.quantity), 0) AS units_sold
  FROM books b LEFT JOIN order_items oi ON oi.book_id = b.book_id AND oi.fulfilment_status <> 'Cancelled'
 WHERE b.status = 'approved'
 GROUP BY b.book_id ORDER BY units_sold DESC, b.title LIMIT 8;

\echo '--- 7. SELF JOIN: every category next to its parent'
SELECT child.name AS category, parent.name AS parent
  FROM categories child LEFT JOIN categories parent ON parent.category_id = child.parent_id ORDER BY parent.name NULLS FIRST, child.name;

\echo '--- 8. GROUP BY / HAVING: sellers with at least 2 orders'
SELECT sp.store_name, count(DISTINCT oi.order_id) AS orders, sum(oi.line_total_cents) / 100.0 AS revenue
  FROM order_items oi JOIN seller_profiles sp ON sp.user_id = oi.seller_id
 WHERE oi.fulfilment_status <> 'Cancelled'
 GROUP BY sp.store_name HAVING count(DISTINCT oi.order_id) >= 2 ORDER BY revenue DESC;

\echo '--- 9. WINDOW functions: rank books inside each category and show a running revenue total'
SELECT c.name AS category, b.title, b.price_cents / 100.0 AS price,
       RANK() OVER (PARTITION BY b.category_id ORDER BY b.price_cents DESC) AS price_rank
  FROM books b JOIN categories c USING (category_id) WHERE b.status = 'approved'
 ORDER BY c.name, price_rank LIMIT 12;
SELECT * FROM fn_sales_report(current_date - 13, current_date);

\echo '--- 10. CTE pipeline: customer lifetime value with a CASE-based tier'
WITH spend AS (
    SELECT o.user_id, count(*) AS orders, sum(o.total_cents) AS total FROM orders o WHERE o.status <> 'Cancelled' GROUP BY o.user_id
)
SELECT u.name, s.orders, s.total / 100.0 AS lifetime_value,
       CASE WHEN s.total >= 200000 THEN 'Gold' WHEN s.total >= 80000 THEN 'Silver' ELSE 'Bronze' END AS tier
  FROM spend s JOIN users u USING (user_id) ORDER BY s.total DESC;

\echo '--- 11. Full-text search (generated tsvector + GIN index)'
SELECT title, ts_rank(search_vector, q) AS rank
  FROM books, websearch_to_tsquery('english', 'physics OR database') q
 WHERE search_vector @@ q ORDER BY rank DESC LIMIT 5;
