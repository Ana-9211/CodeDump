# Why these technologies?

| Choice | Why (the real reason) | Alternative considered |
|---|---|---|
| **PostgreSQL** for orders, stock, users | Money and stock need **ACID transactions** and *row locks*: two people cannot both buy the last copy. It also gives us CHECK constraints, Row Level Security, triggers, procedures, recursive CTEs, window functions and full-text search in one engine. | MySQL: weaker RLS and no `NULLS NOT DISTINCT`, partial indexes or `LATERAL`-style features we use |
| **MongoDB** for reviews and views | Reviews are *documents*: variable text, arrays of voters, read as a whole. No joins, high write rate, and a TTL index gives free expiry of click events. Keeping them out of PostgreSQL also keeps the transactional tables small and fast. | Putting reviews in a table works too; we use the document store where it is genuinely better, and say so |
| **Next.js (App Router)** | One project for UI **and** API route handlers. Server code runs next to the database drivers, so secrets never reach the browser. | Separate Express server (this is what the SE project does) |
| **bcrypt + signed httpOnly cookie** | Passwords are never stored; the cookie cannot be read by page scripts, so XSS cannot steal the session. | JWT in localStorage (readable by scripts: rejected) |
| **Database-level RBAC** | If the web layer has a bug, PostgreSQL still refuses. The rubric asks for *role-based access control in the database*, and this is the strongest form. | Only `if (role === ...)` in code (single lock) |

## NoSQL vs SQL in one picture

```
 Needs a transaction across several rows?      yes -> PostgreSQL (orders, stock, payments)
 Needs strict relationships / foreign keys?    yes -> PostgreSQL (users, books, categories)
 Self-contained, flexible, high write volume?  yes -> MongoDB    (reviews, view events)
```

## CAP/consistency note (viva-friendly)
The rating summary is **eventually consistent**: it is recomputed from MongoDB after every review change and then written to PostgreSQL. If MongoDB is down, the shop keeps working (catalogue, cart, orders) and only the review box shows a friendly message.
