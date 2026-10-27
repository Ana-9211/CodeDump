# Deviations from the submitted SE documents

The SE team's SRS, test plan and architecture were written for a **MERN** build (MongoDB, Express, React, Node) in the repository `Software-Engineering-Project-`. This repository is the **combined DBMS + SE** project, built on PostgreSQL + MongoDB + Next.js. The requirements (FR-01..30, VFR-01..15) are unchanged; what differs is how they are built. Each row below should be reviewed and agreed with the team before it is submitted as the SE implementation.

| # | Submitted document says | This build does | Why | Impact |
|---|---|---|---|---|
| D1 | Express API + React SPA | Next.js 15 route handlers + React 19 | one deployable unit, server-rendered pages | the API paths and roles are the same shape; the component diagram in `se/design-spec.md` replaces the Express one |
| D2 | MongoDB holds everything | PostgreSQL for orders, stock, users, RBAC; MongoDB only for reviews and view events | the DBMS rubric needs relational design, constraints, triggers, procedures, RLS; money and stock need ACID | the architecture pattern changes from "MERN three-tier" to "layered monolith with database-enforced rules" |
| D3 | online payment gateway | test gateway adapter (`lib/gateway.js`), same charge / refund shape | no provider account or network in the build environment | FR-13 is ◐: behaviour is right, provider is simulated |
| D4 | e-mail service | console transport behind `lib/mailer.js` with a database outbox | no SMTP server | FR-01, FR-03, FR-14 are ◐ for delivery, ✅ for logic |
| D5 | cash on delivery not listed | kept as a third payment method | was in the first build; harmless | extra scope, not a requirement |
| D6 | money as 2-decimal numbers | integer paise | avoids floating-point error | FR-12 "2 decimal places" is met when formatting |
| D7 | roles enforced in Express middleware | enforced in PostgreSQL (GRANT, RLS) and again in the route | defence in depth, DBMS rubric | FR-29 stronger than specified |
| D8 | Lighthouse score >= 90 (VFR-11) | axe-core scan, 0 violations | Lighthouse could not start Chromium in the build environment | score not measured; re-run Lighthouse on a normal machine |
| D9 | coverage >= 70 % of unit tests (VFR-13) | 85.7 % of `src/lib`; pages and framework glue are covered by the end-to-end tests but not counted | c8 cannot instrument the separate server process | state the scope when reporting the number |
| D10 | deployment, HTTPS, 99 % availability | not deployed | deployment is a later phase | VFR-05, VFR-09, VFR-12 stay ◐ / not checked |

## Things this repository cannot show
These Part-2 items are about how the team worked on GitHub, so they have to be done in the team's repository by the team, not generated here:
* GitHub Project board, backlog items with story points and assignees, two sprints
* pull requests raised by assignees and reviewed by the owner
* the 1-minute Sprint-1 and 2-minute Sprint-2 videos
* development freeze and sprint review records
* phases 3-5 (requirements not yet issued)

## Known limits of the evidence
* MongoDB was not running in the authoring environment: the review features were tested against an in-memory fake that implements the same driver calls; run `npm test` once with MongoDB up to exercise the real server.
* Payment and e-mail are simulated, see D3 / D4.
* No external security scan was run; the security claims rest on the tests listed in the test plan.
