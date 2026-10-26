# Role-based access control inside the database

> **Analogy - a hotel.** The key card (GRANT) decides which *floors* you may enter. The room number printed on it
> (Row Level Security) decides which *rooms* on that floor. The front desk (SECURITY DEFINER procedure) is the only
> person who can do complicated things for you, and checks your ID first.

## Roles

```
bookstore_app  (LOGIN, NOINHERIT)  ← the web app connects as this; it can do almost nothing by itself
   ├─ SET LOCAL ROLE bookstore_guest      anonymous visitors
   ├─ SET LOCAL ROLE bookstore_customer
   ├─ SET LOCAL ROLE bookstore_seller
   └─ SET LOCAL ROLE bookstore_admin
```
Per request: `BEGIN; SET LOCAL ROLE <role>; SELECT set_config('app.user_id', '<id>', true); ...; COMMIT;`
Both settings are *transaction-local*, so a pooled connection cannot leak identity to the next request.
The role comes from the **database** on each request (`fn_get_session_user`), so suspending a user or promoting a customer takes effect immediately.

## Who can do what

| Data | Guest | Customer | Seller | Admin |
|---|---|---|---|---|
| Approved books, categories | read | read | read (+ own drafts) | read all |
| Own cart, wishlist, addresses | - | read/write | - | - |
| Orders / lines | - | own orders | **only lines with their books** | read all (cannot edit) |
| Payments | - | own | **no access at all** | read |
| `users` table | - | own row, no `password_hash` | own row | all rows, may change **only** `status` |
| Books | - | - | create/edit/remove **via `fn_upsert_book`** | approve / reject / take down |
| Audit log | - | - | - | read, **append-only** |
| Seller applications | - | own | - | read + decide |
| Notifications | - | own (may set `read_at`) | own | own |
| `password_resets` | - | - | - | - (routines only) |

## The three locks

1. **GRANT / REVOKE** (tables, *columns*, functions). Example: `GRANT UPDATE (status) ON users TO bookstore_admin` - an admin can suspend, not rewrite emails.
2. **Row Level Security policies**, e.g. `USING (seller_id = app_user_id())` on `order_items`.
3. **SECURITY DEFINER routines** (`sp_place_order`, `fn_upsert_book`, `fn_decide_seller_application` …), each starting with `fn_require_role('…')`.

## Try it yourself
`psql -d bookstore_dbms -f db/postgres/queries/rbac_demo.sql` prints every allowed query and every `permission denied`.
The same rules are asserted by `tests/database.test.mjs` and, over HTTP, `tests/api.test.mjs`.
