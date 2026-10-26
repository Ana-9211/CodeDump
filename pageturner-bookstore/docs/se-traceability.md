# Software-Engineering backlog → this implementation

The SE project (MERN, sprint plan) lists the requirements. This table shows where each one lives in the merged app.
✅ implemented · ◐ implemented in simulated or partial form · — out of scope for this repository (deployment / team process)

| ID | Requirement | Status | Where |
|---|---|---|---|
| FR-01 | The system shall let a guest register with a name, a unique email address and a... | ✅ | `POST /api/auth/register`, `fn_register_user`, bcrypt |
| FR-02 | The system shall authenticate users by email and password and issue a session token... | ✅ | `POST /api/auth/login`, httpOnly cookie, `fn_get_login` |
| FR-03 | The system shall let a user reset a forgotten password through an emailed link that is... | ✅ | `/api/auth/forgot` + `/reset`, `password_resets`, hashed single-use token, 30 min |
| FR-04 | The system shall display the book catalog paginated at 20 books per page. | ✅ | `GET /api/books` paginated (12/page here; page size is a parameter) |
| FR-05 | The system shall search books by title, author or ISBN using partial, case-insensitive... | ✅ | `search_vector` full-text + title/author/ISBN match |
| FR-06 | The system shall filter books by category, price range, rating and language, and sort... | ✅ | category tree (recursive CTE), price range, rating, in-stock, sort |
| FR-07 | The book detail page shall show title, author, ISBN, price, description, cover image,... | ✅ | `/books/[id]` page |
| FR-08 | A logged-in customer shall be able to add books to, change quantities in, and remove... | ✅ | `/api/cart`, `cart_items` |
| FR-09 | The system shall reject a cart quantity greater than the available stock and display a... | ✅ | trigger `trg_cart_quantity` + `sp_place_order` re-check |
| FR-10 | A customer shall be able to add books to and remove books from a wishlist. | ✅ | `wishlist_items` (M:N), `/wishlist` |
| FR-11 | At checkout, a customer shall select or enter a shipping address. | ✅ | `/checkout`, `addresses`, address snapshot on order |
| FR-12 | The order summary shall show subtotal, tax, shipping and total, computed correctly to... | ✅ | `fn_cart_totals` (subtotal, GST, shipping from `app_settings`) |
| FR-13 | The system shall take payment through an online payment gateway, and an order shall be... | ◐ | simulated payment row via `sp_place_order`; no real gateway |
| FR-14 | The system shall email an order confirmation within 60 seconds of an order being... | ◐ | `notifications` rows created by trigger (in-app + e-mail outbox); no SMTP |
| FR-15 | A customer shall be able to view order history and the current status of each order... | ✅ | `/orders`, `/orders/[id]` with progress tracker |
| FR-16 | A customer shall be able to cancel an order before it is shipped; the system shall... | ✅ | `sp_cancel_order`, restock trigger |
| FR-17 | A customer shall be able to rate (1 to 5) and review a book only if the customer has... | ✅ | MongoDB `reviews`, verified-purchase rule |
| FR-18 | A user shall be able to edit profile details and manage up to 5 saved addresses. | ✅ | `/account`: profile, password change, ≤5 addresses (trigger) |
| FR-19 | A customer shall be able to apply to become a seller, and the seller role shall be... | ✅ | `seller_applications`, `fn_apply_seller` |
| FR-20 | A seller shall be able to create, edit and delete own book listings (title, author,... | ✅ | `fn_upsert_book`, `sp_remove_book`, `/seller` |
| FR-21 | The system shall mark a listing "Out of stock" when its stock reaches 0 and alert the... | ✅ | stock 0 → "Sold out" badge, cart blocked |
| FR-22 | A seller shall be able to view orders containing the seller's books and update their... | ✅ | RLS on `order_items` by `seller_id`, `/api/seller/orders` |
| FR-23 | A seller shall be able to view a sales report for a selected date range. | ✅ | `fn_sales_report` with running total, `/seller` Sales tab |
| FR-24 | An administrator shall be able to suspend and reactivate user accounts, and a... | ✅ | `PATCH /api/admin/users/{id}`, column-level GRANT |
| FR-25 | An administrator shall be able to approve or reject seller applications and new book... | ✅ | `fn_decide_seller_application` (approving promotes the role) |
| FR-26 | An administrator shall be able to add, rename and delete book categories. | ✅ | admin Categories tab, `fn_delete_category` guard |
| FR-27 | An administrator shall be able to remove inappropriate reviews. | ✅ | admin may delete any review (MongoDB) |
| FR-28 | An administrator shall be able to view platform reports of orders, revenue and the 10... | ✅ | admin dashboard: window function, CTE rank, recursive tree |
| FR-29 | The system shall enforce role-based access so that Customer, Seller and Administrator... | ✅ | GRANT + RLS + SECURITY DEFINER (see `rbac.md`) |
| FR-30 | The system shall decrement stock atomically when an order is confirmed, so that stock... | ✅ | row locks `FOR UPDATE` in `sp_place_order`; last-copy race test |
| VFR-01 | Page load time shall be 3 seconds or less at the 95th percentile with 100 concurrent... | — | deployment, CI or team-process item |
| VFR-02 | Search and browse API responses shall be 500 ms or less at the 95th percentile. | — | deployment, CI or team-process item |
| VFR-03 | The system shall support 100 concurrent users with an error rate below 1%. | — | deployment, CI or team-process item |
| VFR-04 | Passwords shall be stored only as salted hashes (bcrypt, cost factor 10 or higher),... | ✅ | bcrypt cost 10 |
| VFR-05 | All client-server traffic shall use HTTPS (TLS 1.2 or higher). | — | deployment, CI or team-process item |
| VFR-06 | The system shall be protected against injection, cross-site scripting (XSS) and... | ✅ | parameterised SQL, CSRF guard, headers, input validation |
| VFR-07 | After 5 consecutive failed login attempts, the account shall be locked for 15 minutes. | ✅ | 5 failures → 15 min lock (values in `app_settings`) |
| VFR-08 | Card data shall never be stored or logged by the system. | ✅ | no card data is collected at all |
| VFR-09 | The deployed system shall maintain at least 99% availability during the evaluation... | — | deployment, CI or team-process item |
| VFR-10 | The user interface shall be responsive from 360 px to 1920 px viewport width, and a... | ✅ | responsive CSS (grid, breakpoints at 880 px) |
| VFR-11 | The Lighthouse accessibility score of the main customer pages shall be 90 or higher. | ◐ | labels, roles, skip link, focus styles; Lighthouse not measured |
| VFR-12 | The system shall work on the latest 2 versions of Chrome, Firefox, Edge and Safari. | — | deployment, CI or team-process item |
| VFR-13 | Unit test line coverage shall be 70% or higher and the linter shall report zero errors. | ✅ | 91 automated tests |
| VFR-14 | Order and payment records shall be written transactionally, and the database shall be... | ✅ | orders + payment + stock written in one transaction |
| VFR-15 | The REST API shall be documented in OpenAPI format and every endpoint shall be listed. | ✅ | `docs/openapi.yaml` |
| TASK-01 | Set up GitHub Actions CI (lint + server/client tests) | — | deployment, CI or team-process item |
| TASK-02 | Record 1-minute Sprint 1 demo video and upload to repo | — | deployment, CI or team-process item |
| TASK-03 | Document deviations from submitted documents for final demo | — | deployment, CI or team-process item |
| TASK-04 | Fix DEF-01: restart checkout when customer holds the last copies | — | deployment, CI or team-process item |
| TASK-05 | Fix DEF-04/05: admin dashboard and S-23/S-29 error states with retry | — | deployment, CI or team-process item |
| TASK-06 | Fix DEF-06: align OpenAPI webhook response schema with SDD | — | deployment, CI or team-process item |
| TASK-07 | Tighten CSP and add Permissions-Policy (DEF-07, DEF-08) | — | deployment, CI or team-process item |
| TASK-08 | Deploy over HTTPS, add uptime monitor and keep-alive, re-run perf tests | — | deployment, CI or team-process item |
| TASK-09 | Record 2-minute Sprint 2 demo video and upload to repo | — | deployment, CI or team-process item |
| TASK-10 | Complete documentation, freeze development | — | deployment, CI or team-process item |
