# Brightloop Subscription Management System

A web platform that runs the full life of a subscription business: products and plans, quotations, subscriptions, automatic invoicing, payments, discounts and revenue reporting. Built for a 7-hour hackathon selection round.

## The problem

Brightloop Software sells business software on monthly and yearly subscriptions. Today, subscriptions live in a spreadsheet, renewals are missed, invoices are typed by hand, payments are matched by scrolling bank statements, and revenue reports are built manually each quarter. This system replaces that with one source of truth.

## Features

- **Authentication and roles:** signup, login, password reset by email link, and three roles (Admin, Staff, Customer portal) enforced on the server
- **Catalog:** products with variants (e.g. brand adds a price), plans with billing periods (daily, weekly, monthly, yearly), taxes, payment terms
- **Quotation to subscription:** quotation templates, and a subscription lifecycle of Draft, Quotation, Confirmed, Active, Closed with a status history
- **Automatic billing:** one-click billing run that creates invoices from subscriptions, applies taxes and discounts, and never bills the same period twice
- **Discounts:** fixed or percentage rules with limits, dates and usage caps, applied automatically
- **Payments:** record payments per invoice (partial payments allowed), with paid, outstanding and overdue tracking
- **Reporting dashboard:** active subscriptions, revenue, amount owed and overdue invoices, with filters

## Tech stack

| Layer | Technology |
|---|---|
| Database | MySQL 8 (local, via Docker) |
| Backend | Node.js, Express, TypeScript, Prisma |
| Frontend | React, Vite, TypeScript, Tailwind CSS, Recharts |
| Validation | Zod (client and server) |
| Auth | bcrypt, JWT in httpOnly cookies |
| Email (dev) | Mailpit local SMTP |

No backend-as-a-service (Firebase, Supabase) is used. Everything runs locally.

## Database design

The schema is designed in third normal form, with foreign keys, `CHECK` constraints and indexes. A unique constraint on `(subscription_id, period_start)` guarantees nothing is billed twice. See `docs/DB_NOTES.md` for table explanations and `docs/ERD.md` for the diagram.

## Project structure

```
/client    React frontend
/server    Express API + Prisma schema and migrations
/docs      DB_NOTES.md, API.md, ERD.md, reference screenshots
docker-compose.yml
RULES.md   Project rules used by our AI coding agent
```

## Team and workflow

- **[1]:** database and backend
- **[2]:** frontend and design system
- Feature branches per task, Conventional Commit messages, merged to `main` at the end of each phase

## License

MIT
