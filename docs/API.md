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

## 4. Auth & Roles Endpoints (Phase 2)

### 4.1 `POST /api/auth/signup`
Creates a new **customer** account.
* **Auth:** None
* **Request body:**
  ```json
  { "name": "Jane Doe", "email": "jane@example.com", "password": "Secure@123" }
  ```
  * `name` — 2–100 chars
  * `email` — valid email, normalised to lowercase
  * `password` — min 9 chars, must contain uppercase, lowercase, digit, and special char
* **Response `201 Created`:**
  ```json
  { "id": 42, "name": "Jane Doe", "email": "jane@example.com", "role": "customer" }
  ```
* **Errors:** `400 VALIDATION_ERROR`, `409 CONFLICT` (email already registered)

---

### 4.2 `POST /api/auth/login`
Authenticates user. Sets `token` httpOnly cookie (7-day expiry).
* **Auth:** None
* **Request body:**
  ```json
  { "email": "jane@example.com", "password": "Secure@123" }
  ```
* **Response `200 OK`:**
  ```json
  { "id": 42, "name": "Jane Doe", "email": "jane@example.com", "role": "customer" }
  ```
* **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (generic message "Invalid email or password" — no user enumeration)
* **Note:** Cookie is `httpOnly`, `sameSite: lax`. CORS configured for `http://localhost:5173` with `credentials: true`.

---

### 4.3 `POST /api/auth/logout`
Clears the auth cookie.
* **Auth:** None required (safe to call when logged out)
* **Response `200 OK`:**
  ```json
  { "message": "Logged out successfully." }
  ```

---

### 4.4 `GET /api/auth/me`
Returns the currently authenticated user's profile.
* **Auth:** Required (any role)
* **Response `200 OK`:**
  ```json
  { "id": 42, "name": "Jane Doe", "email": "jane@example.com", "role": "customer" }
  ```
* **Errors:** `401 UNAUTHORIZED`

---

### 4.5 `POST /api/auth/forgot-password`
Sends a password-reset link to the given email address via Mailpit (dev: `http://localhost:8025`).
* **Auth:** None
* **Request body:**
  ```json
  { "email": "jane@example.com" }
  ```
* **Response `200 OK`** (always — even if email not registered, to prevent user enumeration):
  ```json
  { "message": "If that email is registered, a reset link has been sent." }
  ```
* **Note:** Reset token is hashed (SHA-256) before storage. The link contains the raw token. Token expires in 1 hour and is single-use.

---

### 4.6 `POST /api/auth/reset-password`
Consumes a password-reset token and sets a new password.
* **Auth:** None
* **Request body:**
  ```json
  { "token": "<raw-reset-token>", "password": "NewSecure@456" }
  ```
  * `password` — same complexity rules as signup
* **Response `200 OK`:**
  ```json
  { "message": "Password reset successfully." }
  ```
* **Errors:** `400 VALIDATION_ERROR` (invalid/expired token, or password fails complexity)

---

### 4.7 `POST /api/users/staff`
Admin creates a staff user. Staff cannot self-register via `/signup`.
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  { "name": "Bob Staff", "email": "bob@brightloop.io", "password": "Staff@Pass9" }
  ```
* **Response `201 Created`:**
  ```json
  { "id": 99, "name": "Bob Staff", "email": "bob@brightloop.io", "role": "staff" }
  ```
* **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 CONFLICT`

---

## 5. Catalog Endpoints (Phase 3)

### 5.1 Products & Variants

#### `GET /api/products`
* **Auth:** Required (`admin`, `staff`)
* **Response `200 OK`:** Array of products with their variants:
  ```json
  [
    {
      "id": 1,
      "name": "Cloud Backup Service",
      "type": "service",
      "salesPrice": "99.99",
      "costPrice": "20.00",
      "notes": "Daily automated backups",
      "isActive": true,
      "createdAt": "2026-10-31T09:00:00.000Z",
      "updatedAt": "2026-10-31T09:00:00.000Z",
      "variants": [
        {
          "id": 1,
          "productId": 1,
          "attribute": "Storage",
          "value": "1TB",
          "extraPrice": "20.00"
        }
      ]
    }
  ]
  ```

#### `GET /api/products/:id`
* **Auth:** Required (`admin`, `staff`)
* **Response `200 OK`:** Single product object with `variants`.
* **Errors:** `404 NOT_FOUND`

#### `POST /api/products`
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  {
    "name": "Cloud Backup Service",
    "type": "service",
    "salesPrice": 99.99,
    "costPrice": 20.00,
    "notes": "Optional notes",
    "isActive": true
  }
  ```
* **Response `201 Created`:** Created product object.
* **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`

#### `PUT /api/products/:id`
* **Auth:** Required — **Admin only**
* **Request body:** Partial product fields to update.
* **Response `200 OK`:** Updated product object.
* **Errors:** `400 VALIDATION_ERROR`, `404 NOT_FOUND`

#### `DELETE /api/products/:id`
* **Auth:** Required — **Admin only**
* **Behavior:** Soft deletes by setting `isActive = false`.
* **Response `200 OK`:** `{ "message": "Product deactivated successfully." }`

#### `POST /api/products/:id/variants`
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  {
    "attribute": "Storage",
    "value": "1TB",
    "extraPrice": 20.00
  }
  ```
* **Response `201 Created`:** Created variant object.
* **Errors:** `400 VALIDATION_ERROR`, `409 CONFLICT` (variant attribute/value combination exists for product)

#### `PUT /api/products/:id/variants/:vid`
* **Auth:** Required — **Admin only**
* **Request body:** Partial variant fields.
* **Response `200 OK`:** Updated variant object.

---

### 5.2 Taxes

#### `GET /api/taxes`
* **Auth:** Required (`admin`, `staff`)
* **Response `200 OK`:** Array of tax objects (`id`, `name`, `ratePercent`, `isActive`).

#### `GET /api/taxes/:id`
* **Auth:** Required (`admin`, `staff`)

#### `POST /api/taxes`
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  {
    "name": "Standard GST",
    "ratePercent": 18.00,
    "isActive": true
  }
  ```
* **Response `201 Created`:** Created tax object.
* **Errors:** `400 VALIDATION_ERROR` (ratePercent must be between 0 and 100)

#### `PUT /api/taxes/:id`
* **Auth:** Required — **Admin only**
* **Response `200 OK`:** Updated tax object.

---

### 5.3 Payment Terms

#### `GET /api/payment-terms`
* **Auth:** Required (`admin`, `staff`)
* **Response `200 OK`:** Array of payment terms (`id`, `name`, `dueDays`).

#### `GET /api/payment-terms/:id`
* **Auth:** Required (`admin`, `staff`)

#### `POST /api/payment-terms`
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  {
    "name": "Net 30",
    "dueDays": 30
  }
  ```
* **Response `201 Created`:** Created payment term object.
* **Errors:** `400 VALIDATION_ERROR` (dueDays must be >= 0 integer)

#### `PUT /api/payment-terms/:id`
* **Auth:** Required — **Admin only**

---

### 5.4 Plans

#### `GET /api/plans`
* **Auth:** Required (`admin`, `staff`)
* **Response `200 OK`:** Array of plans (`id`, `name`, `price`, `billingPeriod`, `minQuantity`, `availableFrom`, `availableTo`, `status`).

#### `GET /api/plans/:id`
* **Auth:** Required (`admin`, `staff`)

#### `POST /api/plans`
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  {
    "name": "Enterprise Annual",
    "price": 1200.00,
    "billingPeriod": "yearly",
    "minQuantity": 1,
    "availableFrom": "2026-01-01T00:00:00.000Z",
    "availableTo": "2027-01-01T00:00:00.000Z",
    "autoCloseOnEnd": true,
    "closable": true,
    "pausable": true,
    "renewable": true,
    "status": "active"
  }
  ```
  * `billingPeriod`: `"daily" | "weekly" | "monthly" | "yearly"`
* **Response `201 Created`:** Created plan object.
* **Errors:** `400 VALIDATION_ERROR` (`availableTo` must be >= `availableFrom`)

#### `PUT /api/plans/:id`
* **Auth:** Required — **Admin only**

---

### 5.5 Discounts

#### `GET /api/discounts`
* **Auth:** Required (`admin`, `staff`)
* **Response `200 OK`:** Array of discounts including linked `discountProducts`.

#### `GET /api/discounts/:id`
* **Auth:** Required (`admin`, `staff`)

#### `POST /api/discounts`
* **Auth:** Required — **Admin only**
* **Request body:**
  ```json
  {
    "name": "Early Bird 15%",
    "type": "percent",
    "value": 15.00,
    "minPurchase": 0,
    "minQuantity": 0,
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-12-31T23:59:59.000Z",
    "usageLimit": 500,
    "appliesTo": "subscription",
    "isActive": true,
    "productIds": [1, 2]
  }
  ```
  * `type`: `"fixed" | "percent"` (if `percent`, `value` cannot exceed 100)
  * `appliesTo`: `"product" | "subscription"`
* **Response `201 Created`:** Created discount object with `discountProducts`.
* **Errors:** `400 VALIDATION_ERROR` (`endDate` must be >= `startDate`, `value` bounds)

#### `PUT /api/discounts/:id`
* **Auth:** Required — **Admin only**
* **Response `200 OK`:** Updated discount object with `discountProducts`.

---

## 6. Planned Endpoint Modules (Phases 4-7)

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
