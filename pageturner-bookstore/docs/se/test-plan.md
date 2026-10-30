# Test Plan (IEEE 829 layout) - PageTurner Online Bookstore

Covers the merged DBMS + Software Engineering project. Requirement IDs (FR-nn, VFR-nn) are the ones in the SE team's SRS.
Every case below is an automated test that lives in `tests/` and runs with `npm test`.

## 1. Introduction
**Purpose.** Show that each SRS requirement is verified by at least one repeatable test, and that the security objectives hold.
**Scope.** The Next.js application, its REST API, the PostgreSQL schema (constraints, procedures, triggers, roles, row-level security) and the MongoDB review store.

## 2. Test items
| Item | Version | Where |
|---|---|---|
| SQL schema, routines, triggers, RBAC | `db/postgres/01..10_*.sql` | PostgreSQL 16 |
| REST API (60 operations) | `docs/openapi.yaml` | Next.js 15 route handlers |
| Review store | `src/lib/reviews.js` | MongoDB (in-memory fake for unit level) |
| Pure logic | `src/lib/*.js` | validators, error mapper, gateway adapter |

## 3. Features to be tested
Catalogue, search and filters (FR-04..07) · accounts and sessions (FR-01..03, FR-18, FR-24) · cart, wishlist, checkout, payment, e-mail (FR-08..14) · orders, cancellation, reviews (FR-15..17) · seller tools (FR-19..23) · admin tools (FR-24..28) · access control and stock integrity (FR-29, FR-30) · all VFR items listed in section 5.

## 4. Features not to be tested
| Item | Reason |
|---|---|
| Real payment provider and real SMTP | replaced by test adapters (see deviations.md D3, D4) |
| TLS termination (VFR-05) at a host | verified by the HSTS header only; no deployment exists yet |
| Safari / Firefox / Edge rendering (VFR-12) | only Chromium is available in the build environment |
| Phase 3-5 items (release, deployment) | requirements not yet issued |

## 5. Approach
* **Levels.** Unit (`tests/unit.test.mjs`), database (`tests/database.test.mjs`, direct SQL as each role), NoSQL (`tests/nosql.test.mjs`), API end-to-end (`tests/api.test.mjs`, real `next start` over HTTP).
* **Isolation.** Each file rebuilds the database (`npm run db:reset`) and runs with `--test-concurrency=1`.
* **Tooling.** `node:test`, `c8` for coverage, ESLint, autocannon (load), axe-core via Playwright (accessibility), pg_dump (backup).
* **CI.** `.github/workflows/ci.yml` runs lint, build, tests with the coverage gate, and the OpenAPI freshness check on every push and pull request.

### 5.1 Security validation
| Objective | How it is validated | Test |
|---|---|---|
| SO-1 Only the right role can do or see something | direct SQL as guest / customer / seller / admin; HTTP 401 / 403 matrix | TC-SEC-01, TC-SEC-02 |
| SO-2 Credentials and card data are protected | bcrypt cost 10, hashed reset and verify tokens, no card data in any table or the audit log | TC-FR-13, TC-SEC-03 |
| SO-3 Input cannot become code | SQL-injection strings return normal results; parameterised SQL; CSP header; JSON-only bodies | TC-SEC-04 |
| SO-4 Brute force and forgery are blocked | 5 failures lock the account 15 minutes; tampered cookie ignored; CSRF guard refuses foreign origins | TC-FR-02, TC-SEC-05 |

## 6. Pass / fail criteria
A case passes when every assertion holds. The build passes when all tests pass, ESLint reports 0 errors, line coverage of `src/lib` is at least 70 %, and the load test meets its limits.

## 7. Suspension and resumption
Stop if PostgreSQL is unreachable (all suites would only report connection errors). Resume after `pg_ctl start` and a repeat of `npm run db:reset`. MongoDB-dependent tests skip themselves when port 27017 is closed.

## 8. Deliverables
This plan, test sources in `tests/`, the console report of `npm test`, `docs/load-test-results.json`, the coverage summary of `npm run coverage`.

## 9. Environment
Linux, Node 22, PostgreSQL 16, MongoDB 7 (optional), Chromium for the accessibility run.

## 10. Risks
| Risk | Mitigation |
|---|---|
| MongoDB was not running in the authoring environment, so the live review tests were skipped there | the same suite runs against an in-memory fake (`tests/fake-mongo.mjs`); the live run must be done on a machine with MongoDB |
| Shared database between suites | single-process runs, full reset per file |

## 11. Test cases
| ID | Requirement | Scenario | Expected result | Automated test |
|---|---|---|---|---|
| TC-FR-01 | FR-01 | register, then use the e-mailed link once | account starts unverified, link verifies once, second use is refused | api: *FR-01 e-mail verification* |
| TC-FR-02 | FR-02, VFR-07 | wrong password five times | account locked, even the right password fails; session cookie expires in 60 min | api: *five failed logins lock the account* |
| TC-FR-03 | FR-03 | request and use a reset link | one-time, 30-minute token, old password stops working | api: *FR-03 password reset* |
| TC-FR-04 | FR-04, FR-05, FR-06 | open catalogue, search, filter, sort | 20 per page; title / author / ISBN / category match; language, price, rating filters | api: *20 books per page*, *language filter*, *price and rating filters*, *search by title* |
| TC-FR-07 | FR-07, FR-20 | seller saves a book with a cover URL and alert level | stored and shown; non-http URLs refused | api: *cover image URL and alert level* |
| TC-FR-08 | FR-08, FR-09 | add more than the stock to the cart | refused with a message | api: *cart enforces stock*; db: *cart quantity cannot exceed stock* |
| TC-FR-10 | FR-10 | add / remove wishlist items | private to the customer, idempotent | api: *FR-10 wishlist* |
| TC-FR-12 | FR-11, FR-12 | totals and address at checkout | subtotal + GST + shipping computed in SQL | db: *fn_cart_totals*; api: *checkout needs a valid address* |
| TC-FR-13 | FR-13, VFR-08 | pay with test cards | declined card creates no order and keeps the cart; approved card stores only reference and last 4 digits; cancel refunds | api: *FR-13 payment gateway*; unit: *payment gateway* |
| TC-FR-14 | FR-14 | place an order | notification e-mail marked `sent` within seconds | api: *FR-14 queued notification e-mails* |
| TC-FR-16 | FR-15, FR-16 | view and cancel an order | stock restored, payment refunded; shipped order cannot be cancelled | api: *cancel returns the stock*; db: *cancel restores stock* |
| TC-FR-17 | FR-17 | review a book | refused until the item is Delivered; one review per customer | api: *verified-purchase review lifecycle*; nosql: *one review per user per book* |
| TC-FR-18 | FR-18 | edit profile, add 6th address | profile saved, sixth address refused | api: *FR-18 profile + password change* |
| TC-FR-19 | FR-19, FR-25 | apply, admin approves | role changes only after approval | api: *FR-19/25 seller application* |
| TC-FR-21 | FR-21 | stock falls to the seller's alert level | one notification on crossing, none on repeat | api: *FR-21 the seller is alerted once* |
| TC-FR-22 | FR-22 | seller ships an order line | only own lines visible, illegal status jumps refused | api: *fulfilment*; db: *seller advances status* |
| TC-FR-23 | FR-23, FR-28 | report for a date range | rows per day in range; top 10 books; bad ranges refused | api: *FR-23/28 reports honour a custom date range* |
| TC-FR-24 | FR-24 | admin suspends a user | their session dies at once | api: *admin suspends a customer* |
| TC-FR-26 | FR-26, FR-27 | manage categories, delete a review | tree guards hold; admin can delete any review | api: *FR-26 admin manages categories* |
| TC-FR-30 | FR-30 | two customers buy the last copy | exactly one succeeds, stock never negative | db: *two customers racing for the last copy* |
| TC-SEC-01 | FR-29 | each role reads other roles' data | denied by GRANT / RLS | db: *guest*, *customer*, *seller*, *admin* RBAC tests |
| TC-SEC-02 | FR-29 | guest and wrong-role HTTP calls | 401 / 403 | api: *401 for guests, 403 for the wrong role* |
| TC-SEC-03 | VFR-04, VFR-08 | inspect stored secrets | bcrypt hashes; tokens hashed; no card data | db: *password_resets cannot be read*; api gateway test |
| TC-SEC-04 | VFR-06 | injection strings and CSP | inert results; CSP and HSTS headers present | api: *SQL injection attempts are inert*, *security headers are set* |
| TC-SEC-05 | VFR-06 | forged cookie, foreign origin, wrong content type | ignored / 403 / 415 | api: *a forged or tampered session cookie*, *CSRF guards* |
| TC-VFR-01 | VFR-01..03 | 100 concurrent users | page p95 <= 3 s, API p95 <= 500 ms, errors < 1 % | `npm run loadtest` |
| TC-VFR-09 | VFR-09 | health probe | 200 with database status | api: *VFR-09 health probe* |
| TC-VFR-11 | VFR-10, VFR-11 | accessibility scan of 9 pages | 0 WCAG 2 A/AA violations | `npm run a11y` |
| TC-VFR-13 | VFR-13 | lint and coverage | 0 lint errors, coverage >= 70 % | `npm run lint`, `npm run coverage` |
| TC-VFR-14 | VFR-14 | order is all-or-nothing; backup restores | a failing line rolls back the whole order; dump restores | db: *a failing line rolls the WHOLE order back*; `npm run backup` |
| TC-VFR-15 | VFR-15 | OpenAPI lists every route | no route missing | unit: *VFR-15 docs/openapi.yaml lists every route* |

## 12. Traceability
Requirement-to-test coverage is the "Evidence" column of [../se-traceability.md](../se-traceability.md); every FR and VFR row names at least one case above or states why it is not testable here.
