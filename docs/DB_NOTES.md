# Brightloop Database Notes & Schema Justifications

## 1. Engine & Environment Verification

* **RDBMS:** MySQL Community Server (InnoDB Engine, `utf8mb4` character set, `utf8mb4_0900_ai_ci` collation)
* **Verified Version:** `8.0.46`
* **Version Verification Query:**
  ```sql
  SELECT VERSION();
  -- Output: 8.0.46
  ```
* **Why 8.0.16+ is Mandatory:** MySQL versions prior to 8.0.16 parse `CHECK` constraints without error but silently ignore them during runtime inserts and updates. Running version 8.0.46 guarantees that all domain integrity rules (e.g., positive pricing, date range consistency, percent bounds) are actively enforced by the storage engine.
* **Storage Engine:** All 21 application tables use InnoDB (`information_schema.TABLES.ENGINE = 'InnoDB'`), supporting ACID transactions, row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`), and cascading foreign keys.

---

## 2. Table Rationale, Constraints & Failure Defenses

### Identity Module
1. **`users`**
   * *Purpose:* Authentication and role authorization credentials for Admin, Staff, and Customer users.
   * *Why constraints exist:* `UNIQUE (email)` prevents duplicate accounts under the case-insensitive `utf8mb4_0900_ai_ci` collation. The `role` enum (`admin`, `staff`, `customer`) guarantees valid roles.
   * *What could go wrong without it:* Two users could register with the same email in different cases (`User@test.com` vs `user@test.com`), causing account hijack or ambiguous password reset flows.

2. **`password_reset_tokens`**
   * *Purpose:* Secure, hashed, expiring tokens for self-service password recovery sent via Mailpit.
   * *Why constraints exist:* `UNIQUE (token_hash)` stops token collision; `expires_at` and `used_at` enforce single-use 60-minute validity.
   * *What could go wrong without it:* Token replay attacks could allow attackers to reuse old links to reset user passwords.

3. **`customers`**
   * *Purpose:* Business profiles, company information, and physical billing addresses.
   * *Why constraints exist:* `UNIQUE (user_id)` maintains strict 3NF 1:1 separation between authentication credentials and customer profile records.
   * *What could go wrong without it:* Multiple customer profiles tied to a single user creating conflicting billing contact info on invoices.

### Catalog Module
4. **`products`**
   * *Purpose:* Master catalog of software products, services, or add-ons sold by Brightloop.
   * *Why constraints exist:* `CHECK (sales_price >= 0 AND cost_price >= 0)` guarantees non-negative prices.
   * *What could go wrong without it:* A bug or typo could insert negative pricing, causing customers to be credited or paid instead of billed.

5. **`product_variants`**
   * *Purpose:* Surcharges and attributes (e.g., brand = "Odoo" adds +560.00).
   * *Why constraints exist:* `UNIQUE (product_id, attribute, value)` ensures attribute values are distinct per product. `CHECK (extra_price >= 0)` ensures non-negative surcharges.
   * *What could go wrong without it:* Duplicate variant options causing confusing checkout choices and pricing calculation errors.

6. **`taxes`**
   * *Purpose:* Admin-configured tax rules (e.g. GST 18%, VAT 5%) applied to invoices.
   * *Why constraints exist:* `CHECK (rate_percent BETWEEN 0 AND 100)` enforces valid percentage bounds.
   * *What could go wrong without it:* Tax rates exceeding 100% or negative rates corrupting invoice line totals and violating tax compliance.

7. **`payment_terms`**
   * *Purpose:* Invoice payment deadlines (e.g., "Immediate", "Net 15", "Net 30").
   * *Why constraints exist:* `CHECK (due_days >= 0)` guarantees due dates are not earlier than the issue date.
   * *What could go wrong without it:* Negative due days causing invoices to be flagged as overdue the instant they are generated.

8. **`plans`**
   * *Purpose:* Recurring subscription cadence, pricing, validity periods, and lifecycle switches (`auto_close_on_end`, `closable`, `pausable`, `renewable`).
   * *Why constraints exist:* `CHECK (available_to IS NULL OR available_to >= available_from)`, `CHECK (price >= 0)`, and `CHECK (min_quantity >= 1)`.
   * *What could go wrong without it:* Plans with inverted validity dates or 0 minimum quantities breaking checkout flows.

9. **`discounts`**
   * *Purpose:* Promotional discount rules with usage limits, date ranges, and purchase minimums.
   * *Why constraints exist:* `CHECK (usage_limit IS NULL OR used_count <= usage_limit)` and `CHECK (value >= 0)`.
   * *What could go wrong without it:* Exhausted discount codes continuing to be redeemed, eroding company margins.

10. **`discount_products`**
    * *Purpose:* Explicit M:N join table connecting product-scoped discounts to eligible products.
    * *Why constraints exist:* Composite primary key `(discount_id, product_id)` with cascading foreign keys.
    * *What could go wrong without it:* Orphaned discount links and many-to-many ambiguity.

### Sales Module
11. **`quotation_templates`**
    * *Purpose:* Reusable quotation templates with default plan and validity period.
    * *Why constraints exist:* `CHECK (validity_days > 0)` and foreign key to `plans.id`.
    * *What could go wrong without it:* Quotes generated with zero validity expiring immediately.

12. **`quotation_template_lines`**
    * *Purpose:* Preset line items (product, variant, quantity) inside quotation templates.
    * *Why constraints exist:* `CHECK (quantity > 0)`.
    * *What could go wrong without it:* Templates creating zero-quantity lines that crash order calculations.

13. **`subscriptions`**
    * *Purpose:* Core recurring agreements with status lifecycle (`draft -> quotation -> confirmed -> active -> closed`).
    * *Why constraints exist:* `UNIQUE (number)`, `CHECK (expiry_date >= start_date)`, and index `(status, next_billing_date)`.
    * *What could go wrong without it:* Subscriptions expiring before start dates and slow billing run queries under load.

14. **`subscription_lines`**
    * *Purpose:* Contracted products, agreed unit prices, quantities, and taxes under a subscription.
    * *Why constraints exist:* `CHECK (quantity > 0)`, `CHECK (unit_price >= 0)`, and `CHECK (amount >= 0)`.
    * *What could go wrong without it:* Negative line amounts giving unauthorized customer credits.

15. **`subscription_status_history`**
    * *Purpose:* Immutable audit trail of lifecycle status transitions with actor ID and timestamp.
    * *Why constraints exist:* Foreign key to `subscriptions.id` and `users.id` with timestamp indexing.
    * *What could go wrong without it:* No history of who approved, activated, or closed a customer contract.

### Billing Module
16. **`invoices`**
    * *Purpose:* Billing documents generated exclusively from subscriptions during a billing run.
    * *Why constraints exist:* **`UNIQUE (subscription_id, period_start)`** guarantees that the billing run is idempotent and nothing is ever billed twice. `CHECK (due_date >= issue_date)`, `CHECK (period_end >= period_start)`, and `CHECK (total >= 0 AND amount_paid >= 0)`.
    * *What could go wrong without it:* Concurrency races generating double invoices for the same monthly cycle, leading to customer disputes and accounting nightmares.

17. **`invoice_lines`**
    * *Purpose:* Snapshot line items containing immutable historical descriptions, unit prices, and tax rates.
    * *Why constraints exist:* Snapshots `unit_price` and `tax_rate_snapshot` directly onto each row; `CHECK (quantity > 0)` and `CHECK (unit_price >= 0)`.
    * *What could go wrong without it:* If product prices or tax rules change next year, past invoices would retroactively recalculate, violating tax auditing standards.

18. **`invoice_discounts`**
    * *Purpose:* Join table linking applied discounts to specific invoices, recording the exact deduction taken.
    * *Why constraints exist:* Composite primary key `(invoice_id, discount_id)`.
    * *What could go wrong without it:* Unauditable invoices where totals do not reconcile with line sums.

19. **`payments`**
    * *Purpose:* Payment receipts against invoices supporting partial payments and multiple payment methods.
    * *Why constraints exist:* `CHECK (amount > 0)` and composite indexes on `invoice_id` and `paid_on`.
    * *What could go wrong without it:* Zero or negative payments distorting accounts receivable.

20. **`email_outbox`**
    * *Purpose:* Transactional email queue recording messages sent to Mailpit.
    * *Why constraints exist:* Tracks delivery status (`pending`, `sent`, `failed`) and recipient email.
    * *What could go wrong without it:* Lost password reset requests or silent email delivery failures.

21. **`audit_log`**
    * *Purpose:* General audit trail tracking entity modifications, actions, and actors.
    * *Why constraints exist:* Foreign key to `users.id` and index on `(entity, entity_id)`.

---

## 3. Performance Indexes & EXPLAIN ANALYZE Proof (Section 7.2 & 7.4)

The database was loaded with **10,022 subscriptions** via `npm run seed:bulk`.

### Index Range Scan Benchmark
Query: Finding all active subscriptions due for billing:
```sql
EXPLAIN ANALYZE
SELECT id, number, next_billing_date
FROM subscriptions
WHERE status = 'active' AND next_billing_date <= '2026-10-31 23:59:59'
LIMIT 100;
```

**Actual Execution Plan:**
```text
-> Limit: 100 row(s) (cost=1203 rows=100) (actual time=0.86..0.873 rows=100 loops=1)
    -> Index range scan on subscriptions using subscriptions_status_next_billing_date_idx 
       over (status = 'active' AND NULL < next_billing_date <= '2026-10-31 23:59:59.000'), 
       with index condition: ((subscriptions.`status` = 'active') and (subscriptions.next_billing_date <= TIMESTAMP'2026-10-31 23:59:59')) 
       (cost=1203 rows=2672) (actual time=0.831..0.839 rows=100 loops=1)
```

* **Execution Time:** **0.87 ms** (0.00087 seconds)
* **Performance:** Well within the hackathon's **2-second requirement** for 10,000+ records.

---

## 4. Automated Database Verification Suite Results

Vitest test suite (`server/src/db.test.ts`) executed 9 comprehensive tests:
* `✓ 1. Verifies MySQL version is 8.0.16 or higher (CHECK constraints actively enforced)`
* `✓ 2. Verifies all application tables use InnoDB storage engine`
* `✓ 3. Rejects negative product sales price with CHECK constraint violation`
* `✓ 4. Rejects invalid subscription dates (expiry_date before start_date)`
* `✓ 5. Rejects duplicate user email (UNIQUE constraint)`
* `✓ 6. Rejects duplicate invoice for same subscription & period_start (UNIQUE (subscription_id, period_start))`
* `✓ 7. Rejects discount when used_count exceeds usage_limit (CHECK constraint)`
* `✓ 8. Rejects non-positive payment amount <= 0 (CHECK constraint)`
* `✓ 9. Rejects tax rate percent outside 0 to 100 bound (CHECK constraint)`

**Result: 9 passed (9 tests) in 313ms.**
