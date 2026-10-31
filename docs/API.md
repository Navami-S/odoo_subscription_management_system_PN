# Brightloop API Specification & Contract

This document specifies the REST API contract for Brightloop Subscription Management System.
Member B (Frontend) builds against this specification.

## 1. Global Conventions

* **Base URL:** `http://localhost:5000/api`
* **Content-Type:** `application/json`
* **Authentication:** Handled via HTTP-only cookie `token` containing a signed JWT.
* **Request ID:** Clients may send `X-Request-Id` header; otherwise, the server generates a unique ID returned with errors and logs.

---

## 2. Standard Error Response Format

Every API error response follows this exact JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please fix the highlighted fields.",
    "fields": {
      "email": "This email is already registered."
    },
    "requestId": "a1b2c3"
  }
}
```

### Standard Error Codes & HTTP Status:
| HTTP Status | Error Code | Description |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema validation failed; `fields` maps field names to error messages. |
| `401` | `UNAUTHORIZED` | Authentication missing, invalid, or expired. |
| `403` | `FORBIDDEN` | Authenticated user lacks permission for the resource. |
| `404` | `NOT_FOUND` | Requested entity or route does not exist. |
| `409` | `CONFLICT` | Uniqueness conflict (e.g., duplicate email or subscription period). |
| `422` | `BUSINESS_RULE_ERROR` | Request violates domain/business invariants (e.g., overpayment). |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server condition. Details logged securely with `requestId`. |

---

## 3. System Endpoints (Phase 0)

### 3.1 Health Check
* **Method:** `GET`
* **Path:** `/api/health`
* **Auth:** None
* **Response `200 OK`:**
  ```json
  {
    "status": "ok",
    "service": "brightloop-api",
    "timestamp": "2026-10-31T08:00:00.000Z"
  }
  ```

---

## 4. Planned Endpoint Modules (Phases 2-7)

* **Phase 2 (Auth & Roles):**
  * `POST /api/auth/signup` (Creates customer)
  * `POST /api/auth/login` (Issues httpOnly JWT cookie)
  * `POST /api/auth/logout` (Clears cookie)
  * `POST /api/auth/forgot-password` (Sends reset email via Mailpit)
  * `POST /api/auth/reset-password` (Consumes single-use hashed token)
  * `GET /api/auth/me` (Current authenticated user profile & role)
  * `POST /api/users/staff` (Admin creates staff user)

* **Phase 3 (Catalog - Admin only):**
  * `GET/POST /api/products`, `PUT/DELETE /api/products/:id`
  * `POST /api/products/:id/variants`
  * `GET/POST /api/plans`, `PUT /api/plans/:id`
  * `GET/POST /api/taxes`
  * `GET/POST /api/payment-terms`
  * `GET/POST /api/discounts`

* **Phase 4 (Subscriptions):**
  * `GET/POST /api/quotation-templates`
  * `GET/POST /api/subscriptions`
  * `POST /api/subscriptions/from-template`
  * `PATCH /api/subscriptions/:id/status` (Enforces Draft -> Quotation -> Confirmed -> Active -> Closed)
  * `GET /api/subscriptions/:id/history`

* **Phase 5 (Billing):**
  * `POST /api/billing/run` (Finds active due subscriptions, generates invoices idempotently)
  * `GET /api/invoices`, `GET /api/invoices/:id`
  * `PATCH /api/invoices/:id/status`
  * `POST /api/invoices/:id/send`

* **Phase 6 (Payments & Reports):**
  * `POST /api/payments` (Records payment against invoice; prevents overpayment)
  * `GET /api/reports/dashboard` (KPI tiles, gauge data, striped progress aggregations)
  * `GET /api/reports/revenue-trend`
  * `GET /api/reports/overdue`

* **Phase 7 (Customer Portal):**
  * `GET /api/portal/subscriptions`
  * `GET /api/portal/invoices`
  * `GET /api/portal/payments`
