# BRIGHTLOOP SUBSCRIPTION MANAGEMENT SYSTEM: MASTER PROMPT & PROJECT RULES

> Save this file as `RULES.md` in the repo root, and add a root `GEMINI.md` containing one line: `Read RULES.md fully before doing anything and follow it strictly.` Attach the reference screenshots to the first Antigravity chat. Every new chat starts with: **"Read RULES.md fully, then wait for my instruction."**
>
> **Database: MySQL 8.0.16+ (decided). There is no PostgreSQL anywhere in this project.**

---

## 0. YOUR ROLE AND HOW YOU MUST BEHAVE

You are a senior full-stack engineer pairing with two student developers in a **7-hour hackathon selection round**. The judges weigh **database design and setup** most, then input validation, graceful error handling, clean UI, intuitive navigation and proper Git use. Both developers are beginners at databases, so you must teach as you build.

**Hard behavior rules (never break these):**

1. **Plan, then wait.** Before each phase, post a short plan: files you will create or change, DB changes, and how it will be verified. Do not write code until I reply `GO`.
2. **One phase at a time.** When a phase is done, run typecheck, lint and tests, list how I can verify it by hand, commit, then **STOP** and wait. Never start the next phase on your own.
3. **Stay in scope.** Do not add features, libraries or files that are not in this document. If you think something is needed, ask first.
4. **No dependencies without asking.** Use only the stack in section 2. Ask before adding any package.
5. **No Backend-as-a-Service.** No Firebase, Supabase, Appwrite, Clerk, Auth0 or similar. No external APIs for email, charts data, fonts or icons. Everything runs locally.
6. **No fake data in the final app.** Every screen reads from MySQL through the API. A seed script is the only source of demo data. Static JSON is allowed only for a quick prototype in Phase 1 and must be deleted before Phase 2 ends.
7. **Never run destructive commands** without asking: `git reset --hard`, `git push --force`, `git clean -fd`, `prisma migrate reset`, `DROP TABLE`, `rm -rf`, or anything that deletes data.
8. **Respect file ownership** (section 3). If a task needs a file owned by the other member, tell me instead of editing it.
9. **Explain as you go.** After any DB change, add 2-4 plain-English sentences to `docs/DB_NOTES.md` explaining the table, why each constraint exists and what could go wrong without it. I must be able to defend the schema to a judge.
10. **Be honest.** If something is not working, unfinished, or you are unsure, say so. Do not claim a feature works until you have run it.

---

## 1. THE PRODUCT (from the problem statement)

Build one platform that runs the life of a subscription business: products, plans, taxes, discounts, quotations, subscriptions, invoices, payments and revenue reporting. The company is **Brightloop Software**, which sells business software on subscription (monthly or yearly), add-ons and product variants.

### 1.1 Roles
| Role | Can do |
|---|---|
| **Admin** | Everything. Only role that can create staff, products, plans, taxes, discount rules, payment terms. |
| **Staff** | Day-to-day work: customers, quotations, subscriptions, invoices, payments, reports. Cannot create staff, discounts, plans, taxes. |
| **Customer (portal)** | Sees only their own subscriptions, invoices and payments. Read-mostly. |

Enforce roles **on the server** on every route. Hiding a button in the UI is not security.

### 1.2 Functional requirements (acceptance checklist)

**Auth**
- Signup with email + password. **Email must be unique** (case-insensitive).
- Password: **more than 8 characters** (so minimum 9), at least one uppercase, one lowercase, one special character.
- Forgot password: reset link sent to the registered email. Token is random, **stored hashed**, expires in 60 minutes, single use. Always show the same message whether or not the email exists.
- Only Admin can add staff. Public signup always creates a **customer**.

**Products and plans (Admin)**
- Product: name, type, sales price, cost price, notes.
- Product variants by attribute, e.g. brand = Odoo adds **+560** to the price. A variant has attribute, value and extra price.
- Plan: name, price, billing period (**daily / weekly / monthly / yearly**), minimum quantity, available-from and available-to dates, plus three per-plan switches: `auto_close_on_end`, `closable`, `pausable`, `renewable`. A plan can be active, paused or closed.

**Quotation templates and subscriptions**
- Quotation template: name, validity in days, a plan, and product lines (product, variant, quantity).
- Subscription: unique number (e.g. `SUB-2026-000123`), customer, plan, start date, expiry date, payment terms, and lines (product, quantity, unit price, tax, amount).
- Status flow, **enforced on the server**: `Draft -> Quotation -> Confirmed -> Active -> Closed`. No skipping, no going backwards. Keep a status history so anyone can see where it stands and when it changed.
- Creating a subscription from a template copies the template's lines.

**Billing (the most important flow)**
- Invoices are **generated from subscriptions**, never typed by hand. Customer details, lines, taxes and totals are pre-filled.
- A **Billing Run** (button for Admin/Staff, plus an optional scheduled job) finds all Active subscriptions that are due and creates one invoice each.
- **Nothing is billed twice or skipped.** Enforce this in the database with a unique constraint on `(subscription_id, period_start)`, and make the billing run idempotent: running it twice produces zero extra invoices. Wrap each invoice creation in a transaction.
- Tax is calculated automatically from admin-defined tax rules.
- Invoice status: `Draft -> Confirmed -> Paid`, plus `Cancelled`. Team can confirm, cancel, send (log to the email outbox) and print (print-friendly page) any invoice.

**Discounts (Admin only)**
- Rule: fixed amount or percentage, minimum purchase amount or quantity, start and end date, usage limit.
- Applies to specific products or to whole subscriptions.
- Applied **automatically** on the next invoice when eligible, and stops when expired or the usage limit is reached. Increment `used_count` in the **same transaction** as invoice creation, with a row lock, so two parallel billing runs cannot exceed the limit.

**Payments**
- Record method (cash, card, bank transfer, UPI, cheque), amount, date, note, against one invoice. Partial payments are allowed. When total payments >= invoice total, the invoice becomes `Paid`. Reject overpayment with a clear message.
- Team can always see which invoices are paid and which are outstanding. **Overdue** = due date has passed and not paid; compute from the due date, do not store it.

**Reporting (finance lead dashboard)**
- Active subscriptions count, revenue collected, amount still owed, overdue invoices, recent payments.
- Filters: date range, plan, customer, status. A summary view plus drill-down tables.
- **Every page responds in under 2 seconds with 10,000+ subscriptions.** Use server-side pagination, DB indexes and SQL aggregates (never load everything into memory).

---

## 2. TECH STACK (fixed)

| Layer | Choice |
|---|---|
| Database | **MySQL 8.0.16 or higher** (InnoDB, `utf8mb4`), local, via `docker-compose.yml` (image `mysql:8.0`; fallback: a normal local MySQL install). Also add **Mailpit** to the compose file as a local SMTP catcher for reset emails. |
| Backend | Node.js 20 + TypeScript + Express |
| ORM / migrations | **Prisma** (schema + migrations). Prisma `provider = "mysql"`. Use raw SQL inside migrations for things Prisma cannot express, mainly `CHECK` constraints. |
| Validation | **Zod** on both client and server (share schemas where possible) |
| Auth | `bcrypt` for hashes, `jsonwebtoken`, JWT in an **httpOnly cookie**, `helmet`, `express-rate-limit` on auth routes |
| Frontend | React 18 + Vite + TypeScript, React Router, TanStack Query, React Hook Form + Zod resolver |
| Styling | Tailwind CSS with design tokens from section 6 |
| Charts | Recharts, with custom bar shapes to match the reference |
| Fonts/icons | `@fontsource/plus-jakarta-sans` and `lucide-react` (installed locally, no CDN calls) |
| Logging | `pino` (server) |
| Tests | Vitest for server logic (status machine, tax, discount, billing idempotency). Keep it small, but these four must be tested. |

Repo layout (monorepo):
```
/client      React app
/server      Express + Prisma
/docs        DB_NOTES.md, API.md, ERD.md, reference/ (screenshots)
docker-compose.yml
.env.example
RULES.md
README.md
```

### 2.1 MySQL setup (Member A does this in Phase 0)
`docker-compose.yml` must define two services:
- **mysql**: image `mysql:8.0`, env `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE=brightloop`, port `3306:3306` (if 3306 is already taken on the laptop, use `3307:3306` and change the URL), a named volume for data, a healthcheck, and `--character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci`.
- **mailpit**: SMTP on `1025`, web UI on `8025`.

`.env.example` (real `.env` is never committed):
```
DATABASE_URL="mysql://root:rootpassword@localhost:3306/brightloop"
JWT_SECRET="change-me"
SMTP_HOST="localhost"
SMTP_PORT="1025"
```
In development use the **root** user in `DATABASE_URL`. Prisma's `migrate dev` needs permission to create a temporary shadow database, and a normal app user usually lacks it.

Each developer runs their **own local MySQL**. The schema travels through git as Prisma migrations: after `git pull`, run `docker compose up -d`, then `npx prisma migrate deploy` and `npm run seed` in `/server`.

---

## 3. TEAM SPLIT AND FILE OWNERSHIP

- **Member A: Database + Backend.** Owns `/server/**`, `docker-compose.yml`, `/docs/DB_NOTES.md`, `/docs/API.md`. Only Member A edits `schema.prisma` and migrations.
- **Member B: Frontend + Design system.** Owns `/client/**`. Owns the design tokens and shared UI components.
- **Shared (edit only after agreeing):** `RULES.md`, `README.md`, `/docs/API.md` (A writes, B reads).

**Contract first.** Before Phase 2 starts, Member A publishes `/docs/API.md` listing every endpoint with request and response shapes and the error format (section 5). Member B builds against it. If the API must change, A updates the doc first and tells B.

---

## 4. GIT WORKFLOW (strict)

- Branches: `main` (always runnable), `feat/<module>-<a|b>` per task, e.g. `feat/auth-a`, `feat/layout-b`.
- Commit after **every working step**, using Conventional Commits: `feat(auth): add signup validation`, `fix(billing): prevent duplicate invoice`, `chore: add docker compose`.
- Merge to `main` at the end of every phase and at least every 45 minutes. Run `git pull --rebase origin main` before starting new work.
- **Never commit** `.env`, `node_modules`, database dumps or secrets. Commit `.env.example`.
- When asked to commit, show me the commit message and the `git status` first. Do not force push.
- Resolve merge conflicts by explaining both sides to me, not by silently picking one.

---

## 5. ERROR HANDLING AND VALIDATION (dedicated section; follow exactly)

### 5.1 Single error format (every API error uses this)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please fix the highlighted fields.",
    "fields": { "email": "This email is already registered." },
    "requestId": "a1b2c3"
  }
}
```

### 5.2 Server
- One central **error middleware**, plus an `AppError` class with subclasses: `ValidationError (400)`, `UnauthorizedError (401)`, `ForbiddenError (403)`, `NotFoundError (404)`, `ConflictError (409)`, `BusinessRuleError (422)`.
- Wrap async handlers so no rejection goes unhandled. No stack traces or SQL in responses; log them with `pino` plus a `requestId`.
- **Map database errors to friendly ones** (Prisma codes: `P2002` unique, `P2003` foreign key, `P2025` not found; raw MySQL errors: `1062` duplicate entry, `1452` foreign key, `3819` check constraint): unique violation -> 409 (`"This email is already registered."`), foreign key violation -> 409 or 422, check violation -> 422, record not found -> 404, serialization or lock failure -> retry once then 409.
- Validate **every** request body, query and param with Zod. Reject unknown fields. Trim strings, normalize email to lowercase, cap string lengths, validate dates (`end >= start`), numbers (no negatives, max 2 decimals for money), numeric ID params.
- Business rules return 422 with a human message, e.g. `"Cannot move a subscription from Draft to Active. Confirm it first."`, `"Payment exceeds the outstanding balance of 1,200.00."`.
- Use **DB transactions** for anything touching more than one table (invoice generation, payment recording, status changes). If any step fails, everything rolls back.
- Rate-limit login, signup and reset endpoints. Respond with the same generic message for wrong email vs wrong password.

### 5.3 Client
- A React **Error Boundary** around the app, a friendly 404 page, a 403 page and an offline/server-down banner.
- Map `error.fields` onto form fields so each input shows its own message under it. Show `error.message` as a toast only when there are no field errors.
- Every list and card has **three states**: loading skeleton, empty state (says what to do next, with a button) and error state (with a Retry button).
- Disable the submit button while submitting to stop double clicks. Confirm destructive actions (cancel invoice, close subscription) in a dialog.
- Client validation uses the same rules as the server so the user gets instant feedback, but **never trust it**; the server is the real gate.
- Error copy is plain and specific: it says what went wrong and how to fix it. No "Something went wrong" alone, no apologies, no error codes shown to users.

---

## 6. UI SPECIFICATION (match the attached reference screenshots)

The reference is a **dark, glassy sales dashboard** with a lime and violet accent. Copy its look and structure. Save the screenshots in `/docs/reference/` and look at them before building any screen.

> **Colors are approximate.** Member B must sample the real values from the screenshots with a color picker and replace the tokens below in one file (`/client/src/styles/tokens.css`). After that, **no hard-coded colors anywhere else**; use only tokens.

### 6.1 Design tokens (starting values)
```
--bg-base:        #0A0820   /* page background, deep navy-violet */
--bg-surface:     #120F2C   /* cards / panels */
--bg-surface-2:   #1A1640   /* raised, hover, inputs */
--border-subtle:  rgba(255,255,255,0.08)
--text-primary:   #FFFFFF
--text-muted:     #8E8AB0
--accent-lime:    #C6F432   /* primary accent: active nav, key numbers, primary buttons, positive deltas */
--accent-violet:  #B04CF5   /* secondary accent: second data series, secondary bars */
--accent-violet-deep: #6B2FD0
--danger:         #FF5C7A   /* only for overdue / errors */
--glow-lime:      rgba(198,244,50,0.25)
--page-gradient:  linear-gradient(135deg, #9B7BE0 0%, #C9D85A 100%) /* outer frame behind the app shell, as in the reference */
```
- Typography: **Plus Jakarta Sans**. Big greeting and key numbers in 600-700 weight, labels in 400-500 muted. Sentence case everywhere. No ALL-CAPS labels.
- Radius: cards 20px, inner tiles 14px, chips and bars fully rounded. Cards are translucent surfaces with `backdrop-filter: blur`, a 1px subtle border and a soft inner glow, not heavy drop shadows.
- Spacing: 8px base grid. Page padding 24px, card padding 20px, gap between cards 16px.

### 6.2 App shell
- **Left icon sidebar** (narrow, icons only, tooltip on hover, expands on wider screens): logo at top, then Dashboard, Customers, Products, Plans, Quotation Templates, Subscriptions, Invoices, Payments, Discounts, Taxes, Reports, Users (admin only). Settings and Help pinned at the bottom. Active item = lime filled circle with dark icon. Items the role cannot access are **not rendered**.
- **Top bar:** page switcher / breadcrumb on the left, centered search field with a keyboard hint, then notification bell, theme toggle, language/utility icon and the user avatar menu (profile, logout).
- **Greeting block** on the dashboard: "Welcome back!" small and muted, user name large.
- **Insight card** ("Your day at a glance"): a frosted card with a one or two sentence summary built from **real data using a template string** (not an AI API), e.g. "Revenue is up 12% this month. 3 invoices are overdue." Highlight key numbers in lime.
- A date chip and a filter button on the right side of the dashboard header.

### 6.3 Dashboard widgets (all driven by real SQL aggregates)
1. **KPI tiles** (small glass tiles): Total revenue, Active subscriptions, Outstanding amount, Overdue invoices. Each has a delta chip (lime up arrow / danger down arrow).
2. **Large semicircle/arc gauge** with the current month's collected revenue in the center (as in the reference).
3. **Striped progress rows:** label + big number on the left, a bar made of slanted stripes (`repeating-linear-gradient` at about 70deg) with a lime-to-violet highlight on the filled part. Use for: subscriptions by status, invoices by status, payments by method.
4. **Mirrored wave-bar chart** ("Revenue trend"): thin vertical bars mirrored around a center line, lime above and violet below (billed vs collected). Build with Recharts custom shapes.
5. **Pill bar chart** ("Subscriptions by plan, monthly"): rounded pill bars with a lime top segment and violet bottom segment.
6. Recent payments and overdue invoices as compact dark tables.

### 6.4 Forms, tables and states (same theme everywhere)
- Tables: dark rows with subtle dividers, sticky header, server-side pagination, column filters and search. Row hover uses `--bg-surface-2`.
- Status chips: Draft = muted grey, Quotation = violet, Confirmed = lime outline, Active = lime filled, Closed = grey outline; Invoice Paid = lime filled, Confirmed = lime outline, Overdue = danger.
- Inputs: `--bg-surface-2`, 12px radius, lime focus ring, error text under the field in `--danger`.
- Buttons: primary = lime background with dark text; secondary = ghost with subtle border; destructive = danger outline.
- Subscription detail page shows a **status timeline** (Draft -> Quotation -> Confirmed -> Active -> Closed) with the current step in lime, and the history from the status log.
- Invoice **print view** is a clean light layout (print CSS), the only light screen.
- Quality floor: responsive to tablet width, visible keyboard focus, `prefers-reduced-motion` respected, contrast checked on muted text. One orchestrated entrance on dashboard load is fine; do not animate every card.

### 6.5 Customer portal
Same theme, simplified sidebar: My subscriptions, My invoices, My payments, Profile. Customers can view and download or print invoices, and see subscription status. Nothing else.

---

## 7. DATABASE DESIGN (the part judges care about most)

Design in **3NF** on MySQL 8 (InnoDB, `utf8mb4`). Use `INT`/`BIGINT` auto-increment primary keys everywhere (simplest; stay consistent), `created_at` and `updated_at` on every table. Money is `DECIMAL(12,2)`, **never float**. All totals are computed on the server.

### 7.1 Tables (minimum)

**Identity**
- `users` (id, email UNIQUE (the default `utf8mb4` collation is case-insensitive; still lowercase emails in code), password_hash, role `admin|staff|customer`, is_active, created_by)
- `password_reset_tokens` (id, user_id FK, token_hash, expires_at, used_at)
- `customers` (id, user_id FK UNIQUE, name, phone, company, address fields)

**Catalog**
- `products` (id, name, type, sales_price, cost_price, notes, is_active) with `CHECK (sales_price >= 0 AND cost_price >= 0)`
- `product_variants` (id, product_id FK, attribute, value, extra_price) with `UNIQUE (product_id, attribute, value)`
- `taxes` (id, name, rate_percent, is_active) with `CHECK (rate_percent BETWEEN 0 AND 100)`
- `payment_terms` (id, name, due_days)
- `plans` (id, name, price, billing_period `daily|weekly|monthly|yearly`, min_quantity, available_from, available_to, auto_close_on_end, closable, pausable, renewable, status `active|paused|closed`) with `CHECK (available_to >= available_from)`
- `discounts` (id, name, type `fixed|percent`, value, min_purchase, min_quantity, start_date, end_date, usage_limit, used_count, applies_to `product|subscription`, is_active) with `CHECK (usage_limit IS NULL OR used_count <= usage_limit)`
- `discount_products` (discount_id, product_id) as the join table for product-level discounts

**Sales**
- `quotation_templates` (id, name, plan_id FK, validity_days)
- `quotation_template_lines` (id, template_id FK, product_id FK, variant_id FK null, quantity)
- `subscriptions` (id, number UNIQUE, customer_id FK, plan_id FK, payment_term_id FK, start_date, expiry_date, status `draft|quotation|confirmed|active|closed`, next_billing_date, created_by) with `CHECK (expiry_date >= start_date)`
- `subscription_lines` (id, subscription_id FK, product_id FK, variant_id FK null, quantity > 0, unit_price, tax_id FK, amount)
- `subscription_status_history` (id, subscription_id FK, from_status, to_status, changed_by, changed_at)

**Billing**
- `invoices` (id, number UNIQUE, subscription_id FK, customer_id FK, period_start, period_end, issue_date, due_date, status `draft|confirmed|paid|cancelled`, subtotal, discount_total, tax_total, total, amount_paid) with **`UNIQUE (subscription_id, period_start)`** (this is what guarantees nothing is billed twice)
- `invoice_lines` (id, invoice_id FK, product_id FK, description, quantity, unit_price, tax_rate_snapshot, discount_amount, line_total). **Snapshot** price and tax rate onto the line so old invoices never change when a product or tax changes.
- `invoice_discounts` (invoice_id, discount_id, amount)
- `payments` (id, invoice_id FK, method, amount > 0, paid_on, note, recorded_by)
- `email_outbox` (id, to_email, subject, body, kind, sent_at, status)
- `audit_log` (optional, P2): who changed what

### 7.2 Required indexes (needed for the 2-second rule)
- `subscriptions (status, next_billing_date)`, `subscriptions (customer_id)`, `subscriptions (plan_id)`
- `invoices (status, due_date)`, `invoices (customer_id)`, `invoices (subscription_id)`
- `payments (invoice_id)`, `payments (paid_on)`
- Foreign key columns used in joins. MySQL has no partial indexes, so the `(status, due_date)` index above serves overdue lookups.
- Prove it: after seeding, run `EXPLAIN ANALYZE` on the dashboard and billing queries and paste the results into `docs/DB_NOTES.md`.

### 7.3 Billing run algorithm (implement exactly)
```
BEGIN per subscription (own transaction)
  1. SELECT active subscriptions WHERE next_billing_date <= today  (FOR UPDATE SKIP LOCKED)
  2. build lines from subscription_lines (+ variant extra price)
  3. find eligible discounts (active, in date range, usage_limit not reached, min conditions met)
     lock the discount row, apply, increment used_count
  4. compute tax per line from tax rules, then subtotal, discount_total, tax_total, total
  5. INSERT invoice with due_date = issue_date + payment_term.due_days
     (the UNIQUE (subscription_id, period_start) makes a duplicate fail safely)
  6. advance next_billing_date by the plan's billing period; close the subscription
     if it passed expiry and the plan has auto_close_on_end
COMMIT   (on error: ROLLBACK that subscription only, log it, continue with the rest)
```
The run returns a summary: created, skipped (already billed), failed (with reasons). Provide a **dry-run preview** (P2).

### 7.4 Seed data (`npm run seed`)
- 1 admin, 2 staff, 50 customers with users, 12 products with variants, 6 plans, 4 taxes, 3 payment terms, 5 discounts (some expired, some near the limit), 3 quotation templates.
- A **bulk mode** (`npm run seed:bulk`) that generates **10,000+ subscriptions** and their invoices and payments using batched inserts, so we can prove performance.
- Seed must be idempotent and safe to rerun on a dev database.


### 7.5 Prove the database is configured correctly (Phase 1, mandatory)
1. Run `SELECT VERSION();` and record it in `docs/DB_NOTES.md`. It must be **8.0.16 or higher**; older versions silently ignore `CHECK` constraints.
2. Write a small test that tries to insert invalid rows (negative price, `expiry_date` before `start_date`, duplicate email, duplicate `(subscription_id, period_start)` invoice) and asserts that **MySQL rejects each one**.
3. Make sure all tables use InnoDB (needed for transactions, foreign keys and `SKIP LOCKED`).

---

## 8. PHASES AND TIME BOX (7 hours total, with 45 min buffer)

| Phase | Time | A (DB + API) | B (UI) | Done when |
|---|---|---|---|---|
| **0. Setup** | 30 min | Repo, docker-compose (MySQL + Mailpit), `.env.example`, Prisma init, error middleware skeleton | Vite app, Tailwind, tokens from the screenshots, fonts, folder structure | `docker compose up` works, both apps start, first commit on `main` |
| **1. Foundation** | 45 min | Full schema + migrations + CHECK constraints + indexes, seed script, `DB_NOTES.md` | App shell: sidebar, top bar, theme, shared components (Card, Chip, Button, Input, Table, Skeleton, Toast, Error Boundary) | Schema reviewed and explained; **CHECK constraints proven to be enforced** (see 7.5); shell matches the reference |
| **2. Auth & roles** | 40 min | Signup, login, logout, reset flow (Mailpit), role middleware, admin-creates-staff | Login, signup, forgot/reset pages with field-level errors | All password and email rules enforced and tested; role routes verified |
| **3. Catalog** | 55 min | CRUD: products + variants, taxes, payment terms, plans, discounts (admin only) | List + form pages for each, with validation and empty states | Admin can set up a full catalog |
| **4. Subscriptions** | 65 min | Quotation templates, subscription create-from-template, line pricing, status machine + history | Subscription list, detail with timeline, template picker | Draft -> Closed works; illegal transitions are rejected with clear messages |
| **5. Billing** | 55 min | Billing run, tax, discounts, invoice status, send (outbox), idempotency test | Invoice list/detail, Billing Run button with result summary, print view | Running billing twice creates zero duplicates |
| **6. Payments & reports** | 45 min | Payments (partial, overpayment guard), dashboard aggregates, filters, overdue list | Dashboard widgets per section 6.3, payments page, overdue table | Dashboard numbers match the DB; under 2 s on bulk seed |
| **7. Portal & hardening** | 30 min | Customer-scoped endpoints, final validation pass, `API.md`, EXPLAIN results | Customer portal, 404/403 pages, empty/error states everywhere | Customer sees only their own data |
| **Buffer** | 45 min | Bug fixes, README, demo seed | Polish, responsive check | Demo script rehearsed |

**Priority if time runs short:** P0 = Phases 0-6 (auth, catalog, subscriptions, billing, payments, dashboard). P1 = portal, discounts edge cases, print view. P2 = dry-run preview, theme toggle, audit log, command-palette search. Cut from the bottom, never from the top.

---

## 9. DEFINITION OF DONE (check before every phase handoff)

- [ ] Typecheck, lint and tests pass; the app starts from a clean `docker compose up` + `npm run dev`
- [ ] Every new endpoint validates input with Zod and returns the standard error format
- [ ] Every new table has constraints, indexes and a `DB_NOTES.md` entry (and `SELECT VERSION()` is still 8.0.16+)
- [ ] Role access verified on the server for the new routes
- [ ] UI uses tokens only, matches the reference, and has loading, empty and error states
- [ ] No mock data, no secrets in git, no console errors
- [ ] Work committed on a feature branch with a clear message, merged to `main`

---

## 10. FIRST MESSAGE: DO THIS NOW

1. Read this whole file and the screenshots in `/docs/reference/`.
2. Reply with: (a) a 5-line summary of what we are building, (b) any ambiguity or risk you see in the requirements, (c) the Phase 0 plan.
3. **Do not write code.** Wait for me to reply `GO`.
