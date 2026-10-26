# API summary

Machine-readable spec: [`openapi.yaml`](openapi.yaml) (generated from the route handlers). All bodies are JSON; errors look like `{ "error": "message" }`.

| Area | Endpoints | Roles |
|---|---|---|
| Auth | `POST /api/auth/register · login · logout · forgot · reset`, `GET /api/auth/me` | public |
| Catalogue | `GET /api/books` (q, category, sort, page, inStock, minPrice, maxPrice, minRating), `GET /api/books/{id}`, `GET /api/categories`, `GET /api/trending` | public |
| Reviews (MongoDB) | `GET/POST /api/books/{id}/reviews`, `PATCH/DELETE /api/reviews/{id}`, `POST /api/reviews/{id}/helpful` | read: public; write: customer (verified purchase) |
| Cart & wishlist | `GET/POST/PUT /api/cart`, `DELETE /api/cart/{bookId}`, `GET/POST /api/wishlist`, `DELETE /api/wishlist/{bookId}` | customer |
| Checkout | `GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/{id}`, `POST /api/orders`, `GET /api/orders[/{id}]`, `POST /api/orders/{id}/cancel` | customer |
| Account | `GET/PATCH /api/account`, `POST /api/account/password`, `GET/POST /api/notifications`, `POST /api/seller-application` | signed in |
| Seller | `/api/seller/books`, `/api/seller/orders`, `PATCH /api/seller/order-items/{id}`, `/api/seller/report` | seller |
| Admin | `/api/admin/books`, `/users`, `/seller-applications`, `/categories`, `/report`, `/audit`, `/settings` | admin |

**Status codes:** 400 invalid input · 401 not signed in · 403 role/permission/CSRF · 404 not found (also used when RLS hides a row) · 409 conflict (duplicate, out of stock, already decided) · 429 locked out · 503 MongoDB unavailable.
