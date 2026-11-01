# PageTurner - Online Bookstore (DBMS + Software Engineering, one app)

**Anagha N · PES1UG24CS058 · PES University**
DBMS *Experiential Learning Level 3 mini-project* **and** the database/application layer for the Software Engineering
*Online Bookstore* project - merged into one application.

| | |
|---|---|
| **SQL** | PostgreSQL 16 - 20 tables, constraints, procedures, triggers, views, recursive CTEs, window functions, RLS |
| **NoSQL** | MongoDB - reviews (CRUD + aggregation + validators) and view events (TTL index) |
| **App** | Next.js 15 (App Router): 46 API route files (60 operations) + 17 pages |
| **Security** | Roles enforced **inside PostgreSQL** (GRANT + Row Level Security + SECURITY DEFINER routines) |
| **Tests** | 129 automated tests (unit, database, NoSQL logic, real HTTP API); lint clean; 85.7 % line coverage of `src/lib` |

---

## Run it (5 minutes)

**You need:** Node 20+, PostgreSQL 15+ (16 recommended) and, for reviews/trending, MongoDB 6+.

```bash
npm install
cp .env.example .env            # then edit DATABASE_ADMIN_URL if your postgres superuser needs a password
npm run db:reset                # creates DB, roles, tables, rules, categories, 53 fantasy books (51 approved, 2 for the moderation demo), 8 demo users (1 admin, 2 sellers, 5 customers; the demo orders, carts and wishlists are spread across the customers) (+ Mongo collections if running; an existing review/view collection is cleared because ids restart)
npm run db:seed                 # optional: 16 demo orders spread over 2 weeks, reviews if Mongo is up
npm run dev                     # http://localhost:3000
```

| Demo login (password `Passw0rd!`) | Role |
|---|---|
| `customer1@bookstore.test` to `customer5@bookstore.test` (Karan Shah, Meera Iyer, Nikhil Rao, Sana Qureshi, Arjun Pillai) | customer |
| `seller1@bookstore.test`, `seller2@bookstore.test` | seller |
| `admin@bookstore.test` | admin |

Useful extras: `npm run nosql:demo` (narrated MongoDB CRUD) · `npm test` · `npm run lint` · `npm run coverage` · `npm run loadtest` · `npm run a11y` · `npm run backup` · `npm run openapi` · `psql -d bookstore_dbms -f db/postgres/queries/rbac_demo.sql`

> No MongoDB? The shop still works. The review box on each book shows a friendly "unavailable" message, and the "Trending" shelf on the home page quietly disappears.

---

## Rubric → where to find it (50 marks)

| # | Criterion | Marks | Where |
|---|---|---|---|
| 1 | ER diagram | 2 | [`docs/diagrams/er-diagram.png`](docs/diagrams/er-diagram.png), source `er.mmd` |
| 2 | Relational schema | 3 | [`docs/relational-schema.md`](docs/relational-schema.md) (keys, FDs, normalization) |
| 3 | SQL DDL + constraints | 4 | [`db/postgres/01_schema.sql`](db/postgres/01_schema.sql), [`08_features.sql`](db/postgres/08_features.sql) |
| 4 | NoSQL creation | 4 | [`src/lib/mongo.js`](src/lib/mongo.js) `setupMongo()` - collections, `$jsonSchema`, unique + TTL indexes |
| 5 | Technology justification | 1 | [`docs/technology-justification.md`](docs/technology-justification.md) |
| 6 | DML | 4 | [`db/postgres/queries/dml_examples.sql`](db/postgres/queries/dml_examples.sql), seeds `06`, `07`, `scripts/seed-demo.mjs` |
| 7 | Nested / correlated / recursive / joins | 4 | [`db/postgres/queries/advanced_queries.sql`](db/postgres/queries/advanced_queries.sql) |
| 8 | Procedure / function / trigger / CTE | 6 | [`02_functions.sql`](db/postgres/02_functions.sql), [`03_triggers.sql`](db/postgres/03_triggers.sql), [`04_views.sql`](db/postgres/04_views.sql) |
| 9 | NoSQL features (read / update / delete) | 7 | [`src/lib/reviews.js`](src/lib/reviews.js), `npm run nosql:demo` |
| 10 | Next.js interface | 3 | [`src/app/`](src/app) |
| 11 | Backend / API + DB integration | 2 | [`src/app/api/`](src/app/api), [`docs/openapi.yaml`](docs/openapi.yaml) |
| 12 | Authentication + 2+ roles + RBAC in DB | 4 | [`docs/rbac.md`](docs/rbac.md), [`05_security.sql`](db/postgres/05_security.sql), `src/lib/auth.js` |
| 13 | Documentation + Git/GitHub | 2 | this README, `docs/`, commit history, CI in `.github/workflows` |
| 14 | Originality / viva | 4 | [`docs/viva-guide.html`](docs/viva-guide.html) |

## Software Engineering deliverables (Phase 1 and 2 documents)

| Expected | Where |
|---|---|
| SRS requirements, as built, with evidence for all 45 FR / VFR | [`docs/se-traceability.md`](docs/se-traceability.md) |
| Test plan: sections 3, 4, 5, security validation 5.1, 30 traceable test cases | [`docs/se/test-plan.md`](docs/se/test-plan.md) |
| Architecture and design: pattern, component diagram, traceability, security architecture, 3 sequence diagrams, API design, error handling | [`docs/se/design-spec.md`](docs/se/design-spec.md) |
| Use case diagram | [`docs/se/diagrams/usecase.png`](docs/se/diagrams/usecase.png) |
| Deviations from the team's MERN documents, and what cannot be shown from code (board, PR reviews, videos) | [`docs/se/deviations.md`](docs/se/deviations.md) |
| GitHub Actions | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

Payment and e-mail run through test adapters (`src/lib/gateway.js`, `src/lib/mailer.js`); test cards are listed on the checkout page.

### The 8-point feature list (criterion 8) in one table

| Kind | Name | What it does |
|---|---|---|
| Procedure | `sp_place_order` | one atomic transaction: lock stock rows, create order + lines + payment, empty cart |
| Procedure | `sp_cancel_order`, `sp_remove_book`, `sp_set_rating_summary` | guarded state changes |
| Function | `fn_category_tree` | **recursive CTE** with depth, path and sub-tree book counts |
| Function | `fn_sales_report` | CTE + **window function** (running revenue total) |
| Function | `fn_cart_totals`, `fn_upsert_book`, `fn_register_user`, `fn_apply_seller` … | business logic next to the data |
| Trigger | stock deduction, cart ≤ stock, status workflow guard, restock on cancel, order-status roll-up | integrity rules nobody can bypass |
| Trigger | audit trail, notifications, address limit, `updated_at` | automatic bookkeeping |
| View | `v_book_catalog`, `v_seller_performance` (CTE + `RANK() OVER`), `v_low_stock`, `v_order_overview` | read models; `security_invoker` keeps RLS on |

---

## How the two subjects became one app

The Software Engineering project (MERN, team of four) defines **what** the bookstore must do (30 functional and 15
non-functional requirements). This project is the **database-centric implementation** of the same product, extended with
the DBMS topics. Every requirement is traced in [`docs/se-traceability.md`](docs/se-traceability.md).

```
Browser ── Next.js pages ── API routes ── PostgreSQL  (transactions, stock, orders, users, RBAC)
                                     └─── MongoDB     (reviews, view events)
```

## Layout

```
db/postgres/      00_roles … 08_features.sql (schema, routines, triggers, views, security, data)
db/postgres/queries/   DML, advanced query and RBAC demos you can run in psql
scripts/          db-setup, seed-demo, nosql-demo
src/lib/          db (role switching), mongo, reviews, auth, validation, errors
src/app/          pages + src/app/api route handlers
tests/            database, nosql, api suites
docs/             ER diagram, schema, RBAC, API, testing, SE traceability, viva guide
```

## Security in one glance
bcrypt hashes · httpOnly SameSite cookie · account lockout (5 failures / 15 min) · CSRF guard · parameterised SQL only ·
no SQL text ever sent to the browser · security headers · password-reset tokens stored hashed and single-use · passwords and
card data are never logged (payments are simulated).

## Honest limits
* Book covers and the bookshelf decorations are **not finished**: books without a `cover_url` show a plain "cover pending" tile and the shelf wood is flat colour. Real, licensed assets are tracked in [docs/assets.md](docs/assets.md).
* Payments and e-mail are **simulated** (no gateway, no SMTP). Reset links are always printed on the server console (the terminal running the app). They are also shown on the page when you run `npm run dev`, never under `npm start`.
* MongoDB features were unit-tested against an in-memory engine in the development sandbox; run `npm run nosql:demo` and the full `npm test` with a real `mongod` to see them live (CI does this).

## Push to your own repository
```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
