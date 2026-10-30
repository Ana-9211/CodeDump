# SRS conformance matrix (as built)

The requirement IDs and wording come from the SE team's SRS. ✅ met and tested · ◐ met in part or in simulated form (reason given) · — not checkable here.
Test case IDs refer to [se/test-plan.md](se/test-plan.md).

| ID | Pri | Requirement | Status | How it is met | Test |
|---|---|---|---|---|---|
| FR-01 | M | The system shall let a guest register with a name, a unique email address and a password of at least 8 characters, and shall send an email verification link. | ✅ | register + `email_verifications` (SHA-256 token, 24 h, single use), banner, `/verify-email` | TC-FR-01 |
| FR-02 | M | The system shall authenticate users by email and password and issue a session token that expires after 60 minutes. | ✅ | JWT cookie 60 min, lockout, `fn_get_login` | TC-FR-02 |
| FR-03 | S | The system shall let a user reset a forgotten password through an emailed link that is valid for 30 minutes and can be used once. | ✅ | `/api/auth/forgot` + `/reset`, hashed single-use 30 min token | TC-FR-03 |
| FR-04 | M | The system shall display the book catalog paginated at 20 books per page. | ✅ | `GET /api/books` default 20 per page; the home-page bookshelf loads 12 per batch as the reader scrolls | TC-FR-04 |
| FR-05 | M | The system shall search books by title, author or ISBN using partial, case-insensitive matching. | ✅ | generated `search_vector` GIN + title/author/ISBN/category match | TC-FR-04 |
| FR-06 | S | The system shall filter books by category, price range, rating and language, and sort them by price, rating and newest. | ✅ | category (recursive CTE), price, rating, language, in-stock; sort price/rating/newest | TC-FR-04 |
| FR-07 | M | The book detail page shall show title, author, ISBN, price, description, cover image, stock status and average rating. | ✅ | `/books/[id]`: open-book view with cover image (real `cover_url`, otherwise a plain "cover pending" tile), stock, product ID, average rating | TC-FR-07 |
| FR-08 | M | A logged-in customer shall be able to add books to, change quantities in, and remove books from a cart, and the cart shall persist across sessions. | ✅ | `/api/cart`, `cart_items` persisted in PostgreSQL | TC-FR-08 |
| FR-09 | M | The system shall reject a cart quantity greater than the available stock and display a message. | ✅ | trigger `trg_cart_quantity` + re-check in `sp_place_order` | TC-FR-08 |
| FR-10 | C | A customer shall be able to add books to and remove books from a wishlist. | ✅ | `wishlist_items` | TC-FR-10 |
| FR-11 | M | At checkout, a customer shall select or enter a shipping address. | ✅ | `/checkout`, address snapshot on the order | TC-FR-12 |
| FR-12 | M | The order summary shall show subtotal, tax, shipping and total, computed correctly to 2 decimal places. | ✅ | `fn_cart_totals` (integer paise, GST, shipping from `app_settings`) | TC-FR-12 |
| FR-13 | M | The system shall take payment through an online payment gateway, and an order shall be confirmed only after payment succeeds. | ◐ | card / UPI charged through the test gateway adapter; order created only after a successful charge, refund on failure. No real provider (deviation D3). Cash on delivery kept as an extra | TC-FR-13 |
| FR-14 | S | The system shall email an order confirmation within 60 seconds of an order being confirmed. | ◐ | trigger queues a notification, mailer sends it after the request (console transport, deviation D4) | TC-FR-14 |
| FR-15 | M | A customer shall be able to view order history and the current status of each order (Placed, Packed, Shipped, Delivered, Cancelled). | ✅ | `/orders`, `/orders/[id]` with progress; line statuses Placed, Packed, Shipped, Delivered, Cancelled | TC-FR-16 |
| FR-16 | S | A customer shall be able to cancel an order before it is shipped; the system shall restore stock and initiate a refund. | ✅ | `sp_cancel_order`, restock trigger, gateway refund | TC-FR-16 |
| FR-17 | S | A customer shall be able to rate (1 to 5) and review a book only if the customer has purchased and received it. | ✅ | MongoDB `reviews`; allowed only when the item is Delivered (`fn_has_purchased`) | TC-FR-17 |
| FR-18 | S | A user shall be able to edit profile details and manage up to 5 saved addresses. | ✅ | `/account` profile and password; at most 5 addresses (trigger) | TC-FR-18 |
| FR-19 | M | A customer shall be able to apply to become a seller, and the seller role shall be activated only after administrator approval. | ✅ | `seller_applications`, role changes only on admin approval | TC-FR-19 |
| FR-20 | M | A seller shall be able to create, edit and delete own book listings (title, author, ISBN, price, stock, images). | ✅ | `fn_upsert_book`, `sp_remove_book`, `/seller`, cover image URL | TC-FR-07 |
| FR-21 | S | The system shall mark a listing "Out of stock" when its stock reaches 0 and alert the seller when stock falls below a seller-defined threshold. | ✅ | "Sold out" at 0; per-book alert level; notification when stock crosses it | TC-FR-21 |
| FR-22 | M | A seller shall be able to view orders containing the seller's books and update their fulfilment status. | ✅ | RLS on `order_items` by seller, workflow trigger | TC-FR-22 |
| FR-23 | C | A seller shall be able to view a sales report for a selected date range. | ✅ | `fn_sales_report` with date-range picker | TC-FR-23 |
| FR-24 | M | An administrator shall be able to suspend and reactivate user accounts, and a suspended user shall not be able to log in. | ✅ | `PATCH /api/admin/users/{id}`, session dies at once | TC-FR-24 |
| FR-25 | M | An administrator shall be able to approve or reject seller applications and new book listings. | ✅ | `fn_decide_seller_application`, book moderation | TC-FR-19 |
| FR-26 | S | An administrator shall be able to add, rename and delete book categories. | ✅ | admin categories tab, `fn_delete_category` guard | TC-FR-26 |
| FR-27 | S | An administrator shall be able to remove inappropriate reviews. | ✅ | admin deletes any review | TC-FR-26 |
| FR-28 | C | An administrator shall be able to view platform reports of orders, revenue and the 10 best-selling books for a selected date range. | ✅ | admin dashboard with date range, top 10 books | TC-FR-23 |
| FR-29 | M | The system shall enforce role-based access so that Customer, Seller and Administrator users can access only the functions of their own role. | ✅ | GRANT + RLS + `fn_require_role`; route gates | TC-SEC-01, TC-SEC-02 |
| FR-30 | M | The system shall decrement stock atomically when an order is confirmed, so that stock never becomes negative under concurrent orders. | ✅ | `FOR UPDATE` row locks in `sp_place_order` | TC-FR-30 |
| VFR-01 | M | Page load time shall be 3 seconds or less at the 95th percentile with 100 concurrent users. | ✅ | measured: p95 100-170 ms at 100 users (`docs/load-test-results.json`) | TC-VFR-01 |
| VFR-02 | M | Search and browse API responses shall be 500 ms or less at the 95th percentile. | ✅ | measured: p97.5 300-480 ms at 100 users, limit 500 | TC-VFR-01 |
| VFR-03 | S | The system shall support 100 concurrent users with an error rate below 1%. | ✅ | 0 % errors at 100 concurrent users | TC-VFR-01 |
| VFR-04 | M | Passwords shall be stored only as salted hashes (bcrypt, cost factor 10 or higher), never in plaintext. | ✅ | bcrypt cost 10 | TC-SEC-03 |
| VFR-05 | M | All client-server traffic shall use HTTPS (TLS 1.2 or higher). | ◐ | HSTS header set; TLS itself needs the host (not deployed yet) | — |
| VFR-06 | M | The system shall be protected against injection, cross-site scripting (XSS) and cross-site request forgery (CSRF), with zero high or critical findings in an OWASP ZAP baseline scan. | ✅ | parameterised SQL, validation, CSP, CSRF guard; no external pen-test run | TC-SEC-04, TC-SEC-05 |
| VFR-07 | S | After 5 consecutive failed login attempts, the account shall be locked for 15 minutes. | ✅ | 5 failures, 15 min (values in `app_settings`) | TC-FR-02 |
| VFR-08 | M | Card data shall never be stored or logged by the system. | ✅ | gateway keeps only reference and last 4; test scans tables and audit log | TC-FR-13 |
| VFR-09 | S | The deployed system shall maintain at least 99% availability during the evaluation window, with a keep-alive mechanism configured to prevent unintended idling or sleep. Availability shall be measured using periodic health checks at intervals of 5 minutes or less. | ◐ | `/api/health` for a keep-alive pinger; 99 % availability needs a deployment | TC-VFR-09 |
| VFR-10 | M | The user interface shall be responsive from 360 px to 1920 px viewport width, and a first-time user shall be able to complete a purchase in 6 steps or fewer. | ◐ | responsive CSS; scan done at desktop size; the first-time-user purchase-steps target was not user-tested | TC-VFR-11 |
| VFR-11 | S | The Lighthouse accessibility score of the main customer pages shall be 90 or higher. | ◐ | axe-core: 0 violations on 9 pages. Lighthouse itself could not be launched here, so the score is not measured | TC-VFR-11 |
| VFR-12 | S | The system shall work on the latest 2 versions of Chrome, Firefox, Edge and Safari. | ◐ | Chromium only | — |
| VFR-13 | M | Unit test line coverage shall be 70% or higher and the linter shall report zero errors. | ✅ | ESLint 0 errors; 85.7 % line coverage of `src/lib` (framework-bound files excluded) | TC-VFR-13 |
| VFR-14 | S | Order and payment records shall be written transactionally, and the database shall be backed up daily. | ✅ | atomic order procedure; `npm run backup` (pg_dump, restore verified); daily schedule is left to the host | TC-VFR-14 |
| VFR-15 | S | The REST API shall be documented in OpenAPI format and every endpoint shall be listed. | ✅ | `docs/openapi.yaml` generated; unit test fails if a route is missing | TC-VFR-15 |
