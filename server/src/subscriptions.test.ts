import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from './app.js';
import { prisma } from './utils/prisma.js';

const PORT = 5101;
let server: http.Server;

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function api(
  method: string,
  path: string,
  body?: object,
  cookie?: string
): Promise<{ status: number; body: any; setCookie?: string }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode ?? 500,
              body: data ? JSON.parse(data) : null,
              setCookie: res.headers['set-cookie']?.[0],
            });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function loginAs(email: string, password: string): Promise<string> {
  const r = await api('POST', '/api/auth/login', { email, password });
  const cookie = r.setCookie;
  if (!cookie || r.status !== 200) {
    throw new Error(`Login failed for ${email}: status=${r.status} body=${JSON.stringify(r.body)}`);
  }
  return cookie.split(';')[0];
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, '127.0.0.1', () => resolve());
  });
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

let adminCookie: string;
let staffCookie: string;
let customerCookie: string;

let testPlanId: number;
let testProductId: number;
let testCustomerId: number;
let testPaymentTermId: number;

// ─── Setup & Authentication ───────────────────────────────────────────────────

describe('Subscriptions & Quotations Suite', () => {
  it('setup – authenticate roles and fetch reference IDs', async () => {
    adminCookie = await loginAs('admin@brightloop.io', 'Admin@123!');
    staffCookie = await loginAs('staff1@brightloop.io', 'Staff@123!');
    customerCookie = await loginAs('customer1@brightloop.io', 'Customer@123!');

    expect(adminCookie).toBeTruthy();
    expect(staffCookie).toBeTruthy();
    expect(customerCookie).toBeTruthy();

    const [plan, product, customer, term] = await Promise.all([
      prisma.plan.findFirst(),
      prisma.product.findFirst(),
      prisma.customer.findFirst(),
      prisma.paymentTerm.findFirst(),
    ]);

    expect(plan).toBeTruthy();
    expect(product).toBeTruthy();
    expect(customer).toBeTruthy();
    expect(term).toBeTruthy();

    testPlanId = plan!.id;
    testProductId = product!.id;
    testCustomerId = customer!.id;
    testPaymentTermId = term!.id;
  });

  // ─── Quotation Templates ────────────────────────────────────────────────────

  describe('Quotation Templates', () => {
    let createdTemplateId: number;

    it('GET /api/quotation-templates – unauthenticated returns 401', async () => {
      const r = await api('GET', '/api/quotation-templates');
      expect(r.status).toBe(401);
    });

    it('GET /api/quotation-templates – customer returns 403', async () => {
      const r = await api('GET', '/api/quotation-templates', undefined, customerCookie);
      expect(r.status).toBe(403);
    });

    it('POST /api/quotation-templates – staff returns 403 (Admin only)', async () => {
      const r = await api(
        'POST',
        '/api/quotation-templates',
        {
          name: 'Staff Template',
          planId: testPlanId,
          validityDays: 14,
          lines: [{ productId: testProductId, quantity: 1 }],
        },
        staffCookie
      );
      expect(r.status).toBe(403);
    });

    it('POST /api/quotation-templates – admin creates template', async () => {
      const r = await api(
        'POST',
        '/api/quotation-templates',
        {
          name: 'Premium Cloud Bundle',
          planId: testPlanId,
          validityDays: 45,
          lines: [{ productId: testProductId, quantity: 2 }],
        },
        adminCookie
      );
      expect(r.status).toBe(201);
      expect(r.body.name).toBe('Premium Cloud Bundle');
      expect(r.body.lines.length).toBe(1);
      expect(r.body.lines[0].quantity).toBe(2);
      createdTemplateId = r.body.id;
    });

    it('GET /api/quotation-templates – staff can list templates', async () => {
      const r = await api('GET', '/api/quotation-templates', undefined, staffCookie);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
      expect(r.body.some((t: any) => t.id === createdTemplateId)).toBe(true);
    });

    it('GET /api/quotation-templates/:id – returns template with lines', async () => {
      const r = await api('GET', `/api/quotation-templates/${createdTemplateId}`, undefined, staffCookie);
      expect(r.status).toBe(200);
      expect(r.body.id).toBe(createdTemplateId);
      expect(r.body.validityDays).toBe(45);
    });

    it('PUT /api/quotation-templates/:id – admin updates validity', async () => {
      const r = await api(
        'PUT',
        `/api/quotation-templates/${createdTemplateId}`,
        { validityDays: 60 },
        adminCookie
      );
      expect(r.status).toBe(200);
      expect(r.body.validityDays).toBe(60);
    });

    it('DELETE /api/quotation-templates/:id – admin deletes template', async () => {
      // Create temporary template to delete
      const temp = await api(
        'POST',
        '/api/quotation-templates',
        {
          name: 'Temp To Delete',
          planId: testPlanId,
          validityDays: 7,
          lines: [{ productId: testProductId, quantity: 1 }],
        },
        adminCookie
      );
      const tempId = temp.body.id;

      const del = await api('DELETE', `/api/quotation-templates/${tempId}`, undefined, adminCookie);
      expect(del.status).toBe(200);

      const check = await api('GET', `/api/quotation-templates/${tempId}`, undefined, adminCookie);
      expect(check.status).toBe(404);
    });
  });

  // ─── Subscriptions Creation ─────────────────────────────────────────────────

  describe('Subscriptions Lifecycle', () => {
    let createdSubscriptionId: number;
    let templateSubId: number;

    const start = new Date().toISOString();
    const expiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const invalidExpiry = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    it('POST /api/subscriptions – validation: expiryDate <= startDate returns 400', async () => {
      const r = await api(
        'POST',
        '/api/subscriptions',
        {
          customerId: testCustomerId,
          planId: testPlanId,
          paymentTermId: testPaymentTermId,
          startDate: start,
          expiryDate: invalidExpiry,
          lines: [{ productId: testProductId, quantity: 1 }],
        },
        staffCookie
      );
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/subscriptions – customer returns 403', async () => {
      const r = await api(
        'POST',
        '/api/subscriptions',
        {
          customerId: testCustomerId,
          planId: testPlanId,
          paymentTermId: testPaymentTermId,
          startDate: start,
          expiryDate: expiry,
          lines: [{ productId: testProductId, quantity: 1 }],
        },
        customerCookie
      );
      expect(r.status).toBe(403);
    });

    it('POST /api/subscriptions – staff creates manual subscription in draft', async () => {
      const r = await api(
        'POST',
        '/api/subscriptions',
        {
          customerId: testCustomerId,
          planId: testPlanId,
          paymentTermId: testPaymentTermId,
          startDate: start,
          expiryDate: expiry,
          lines: [{ productId: testProductId, quantity: 3, unitPrice: 50.0 }],
        },
        staffCookie
      );
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('draft');
      expect(r.body.number).toMatch(/^SUB-\d{4}-\d+/);
      expect(r.body.lines.length).toBe(1);
      expect(Number(r.body.lines[0].unitPrice)).toBe(50.0);
      expect(Number(r.body.lines[0].amount)).toBe(150.0);
      createdSubscriptionId = r.body.id;
    });

    it('POST /api/subscriptions/from-template – creates subscription from template', async () => {
      // Find or create a template
      const templates = await prisma.quotationTemplate.findMany({ take: 1 });
      const templateId = templates[0].id;

      const r = await api(
        'POST',
        '/api/subscriptions/from-template',
        {
          templateId,
          customerId: testCustomerId,
          paymentTermId: testPaymentTermId,
        },
        staffCookie
      );
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('draft');
      expect(r.body.lines.length).toBeGreaterThanOrEqual(1);
      templateSubId = r.body.id;
    });

    it('GET /api/subscriptions – lists subscriptions with pagination', async () => {
      const r = await api('GET', '/api/subscriptions?page=1&limit=10', undefined, staffCookie);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.data)).toBe(true);
      expect(r.body.pagination).toBeDefined();
      expect(r.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /api/subscriptions/:id – returns single subscription with customer and lines', async () => {
      const r = await api('GET', `/api/subscriptions/${createdSubscriptionId}`, undefined, staffCookie);
      expect(r.status).toBe(200);
      expect(r.body.id).toBe(createdSubscriptionId);
      expect(r.body.customer).toBeDefined();
      expect(r.body.lines.length).toBe(1);
    });

    // ─── Status State Machine & Transitions ─────────────────────────────────

    it('PATCH /api/subscriptions/:id/status – illegal transition draft -> active rejected with 422', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${createdSubscriptionId}/status`,
        { status: 'active' },
        staffCookie
      );
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('BUSINESS_RULE_ERROR');
      expect(r.body.error.message).toMatch(/cannot transition/i);
    });

    it('PATCH /api/subscriptions/:id/status – transition draft -> quotation succeeds', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${createdSubscriptionId}/status`,
        { status: 'quotation' },
        staffCookie
      );
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('quotation');
    });

    it('PATCH /api/subscriptions/:id/status – transition quotation -> confirmed succeeds', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${createdSubscriptionId}/status`,
        { status: 'confirmed' },
        staffCookie
      );
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('confirmed');
    });

    it('PATCH /api/subscriptions/:id/status – transition confirmed -> active succeeds and sets nextBillingDate', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${createdSubscriptionId}/status`,
        { status: 'active' },
        staffCookie
      );
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('active');
      expect(r.body.nextBillingDate).toBeDefined();
    });

    it('PATCH /api/subscriptions/:id/status – transition active -> closed succeeds', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${createdSubscriptionId}/status`,
        { status: 'closed' },
        staffCookie
      );
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('closed');
    });

    it('PATCH /api/subscriptions/:id/status – transition from closed -> active rejected with 422', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${createdSubscriptionId}/status`,
        { status: 'active' },
        staffCookie
      );
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('BUSINESS_RULE_ERROR');
    });

    it('PATCH /api/subscriptions/:id/status – draft -> closed discard succeeds', async () => {
      const r = await api(
        'PATCH',
        `/api/subscriptions/${templateSubId}/status`,
        { status: 'closed' },
        staffCookie
      );
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('closed');
    });

    // ─── Status History Audit Trail ─────────────────────────────────────────

    it('GET /api/subscriptions/:id/history – returns audit trail of all status transitions', async () => {
      const r = await api('GET', `/api/subscriptions/${createdSubscriptionId}/history`, undefined, staffCookie);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body)).toBe(true);
      // draft -> draft (init), draft -> quotation, quotation -> confirmed, confirmed -> active, active -> closed
      expect(r.body.length).toBeGreaterThanOrEqual(4);

      const latest = r.body[0];
      expect(latest.toStatus).toBe('closed');
      expect(latest.fromStatus).toBe('active');
      expect(latest.user).toBeDefined();
    });
  });
});
