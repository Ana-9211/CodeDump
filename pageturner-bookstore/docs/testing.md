# Testing

`npm test` rebuilds the database from scratch and runs four suites (Node's built-in test runner):

| Suite | Tests | What it proves |
|---|---|---|
| `tests/unit.test.mjs` | 13 | validators, error mapper (no SQL leaks), payment gateway rules, form parsing, OpenAPI completeness |
| `tests/database.test.mjs` | 34 | constraints, `sp_place_order` atomic rollback, **last-copy race** (two buyers, one book, exactly one wins), triggers, status workflow, RBAC denials, RLS isolation, new-table lockdown |
| `tests/nosql.test.mjs` | 15 | review service CRUD, one-review-per-user, helpful votes, aggregation, trending, validator shape |
| `tests/api.test.mjs` | 53 | the real Next.js server over HTTP: auth, lockout, CSRF, each role's allowed/forbidden endpoints, cart → checkout → cancel, seller & admin flows, password reset, wishlist, seller applications, category admin, filters, e-mail verification, e-mail outbox, low-stock alert, payment gateway, report ranges, CSP, health |

Run one suite: `node --test tests/api.test.mjs`. Tests that need MongoDB are skipped when port 27017 is closed.

## Manual demo script (5 minutes)
1. Guest browses, searches "dune", filters price ≤ ₹300.
2. Register as customer → add two books → checkout (UPI) → open the order, watch the notification bell.
3. Sign in as `seller1` → Orders → mark the line *Packed → Shipped*; see the customer's notification.
4. Sign in as `admin` → approve the pending book, view the audit log entry it created.
5. In psql run `rbac_demo.sql` and show every `permission denied`.

Other checks: `npm run lint` (ESLint, 0 errors) · `npm run coverage` (c8, fails under 70 % of `src/lib`) · `npm run loadtest` (100 users) · `npm run a11y` (axe-core) · `npm run backup`.
