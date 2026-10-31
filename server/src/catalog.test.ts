import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from './app.js';
import { prisma } from './utils/prisma.js';

const PORT = 5100;
let server: http.Server;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function api(
  method: string,
  path: string,
  body?: object,
  cookie?: string
): Promise<{ status: number; body: unknown; setCookie?: string }> {
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

// ─── Login helper ─────────────────────────────────────────────────────────────

async function loginAs(email: string, password: string): Promise<string> {
  const r = await api('POST', '/api/auth/login', { email, password });
  const cookie = r.setCookie;
  if (!cookie || r.status !== 200) {
    throw new Error(`Login failed for ${email}: status=${r.status} body=${JSON.stringify(r.body)}`);
  }
  return cookie.split(';')[0]; // "token=<jwt>"
}

beforeAll(() => {
  return new Promise<void>((resolve) => {
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

// ─── Products ─────────────────────────────────────────────────────────────────

describe('Products', () => {
  let createdProductId: number;
  let createdVariantId: number;

  it('setup – login all roles', async () => {
    adminCookie = await loginAs('admin@brightloop.io', 'Admin@123!');
    staffCookie = await loginAs('staff1@brightloop.io', 'Staff@123!');
    customerCookie = await loginAs('customer1@brightloop.io', 'Customer@123!');
    expect(adminCookie).toBeTruthy();
    expect(staffCookie).toBeTruthy();
    expect(customerCookie).toBeTruthy();
  });

  it('GET /api/products – unauthenticated returns 401', async () => {
    const r = await api('GET', '/api/products');
    expect(r.status).toBe(401);
  });

  it('GET /api/products – customer returns 403', async () => {
    const r = await api('GET', '/api/products', undefined, customerCookie);
    expect(r.status).toBe(403);
  });

  it('GET /api/products – staff returns 200 array', async () => {
    const r = await api('GET', '/api/products', undefined, staffCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('POST /api/products – staff returns 403', async () => {
    const r = await api('POST', '/api/products', { name: 'Staff Product', type: 'service', salesPrice: 10 }, staffCookie);
    expect(r.status).toBe(403);
  });

  it('POST /api/products – admin creates product', async () => {
    const r = await api('POST', '/api/products', { name: 'Test SaaS Product', type: 'service', salesPrice: 99.99, costPrice: 20 }, adminCookie);
    expect(r.status).toBe(201);
    const body = r.body as { name: string; id: number; variants: unknown[] };
    expect(body.name).toBe('Test SaaS Product');
    expect(body.variants).toEqual([]);
    createdProductId = body.id;
  });

  it('POST /api/products – validation: salesPrice < 0 returns 400', async () => {
    const r = await api('POST', '/api/products', { name: 'Bad Product', type: 'service', salesPrice: -5 }, adminCookie);
    expect(r.status).toBe(400);
    expect((r.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/products – validation: name too short returns 400', async () => {
    const r = await api('POST', '/api/products', { name: 'X', type: 'service', salesPrice: 10 }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('PUT /api/products/:id – admin updates price', async () => {
    const r = await api('PUT', `/api/products/${createdProductId}`, { salesPrice: 149.99 }, adminCookie);
    expect(r.status).toBe(200);
    expect(Number((r.body as { salesPrice: string }).salesPrice)).toBe(149.99);
  });

  it('GET /api/products/:id – staff sees updated price', async () => {
    const r = await api('GET', `/api/products/${createdProductId}`, undefined, staffCookie);
    expect(r.status).toBe(200);
    expect(Number((r.body as { salesPrice: string }).salesPrice)).toBe(149.99);
  });

  it('POST /api/products/:id/variants – admin adds variant', async () => {
    const r = await api('POST', `/api/products/${createdProductId}/variants`, { attribute: 'Storage', value: '1TB', extraPrice: 20 }, adminCookie);
    expect(r.status).toBe(201);
    const body = r.body as { attribute: string; id: number };
    expect(body.attribute).toBe('Storage');
    createdVariantId = body.id;
  });

  it('POST /api/products/:id/variants – duplicate returns 409', async () => {
    const r = await api('POST', `/api/products/${createdProductId}/variants`, { attribute: 'Storage', value: '1TB', extraPrice: 20 }, adminCookie);
    expect(r.status).toBe(409);
  });

  it('GET /api/products/:id – includes variant', async () => {
    const r = await api('GET', `/api/products/${createdProductId}`, undefined, adminCookie);
    expect(r.status).toBe(200);
    const body = r.body as { variants: { id: number }[] };
    expect(body.variants.some((v) => v.id === createdVariantId)).toBe(true);
  });

  it('DELETE /api/products/:id – admin soft-deletes', async () => {
    const r = await api('DELETE', `/api/products/${createdProductId}`, undefined, adminCookie);
    expect(r.status).toBe(200);
    expect((r.body as { message: string }).message).toMatch(/deactivated/i);

    const check = await api('GET', `/api/products/${createdProductId}`, undefined, adminCookie);
    expect((check.body as { isActive: boolean }).isActive).toBe(false);
  });

  it('GET /api/products/:id – unknown id returns 404', async () => {
    const r = await api('GET', '/api/products/99999999', undefined, adminCookie);
    expect(r.status).toBe(404);
  });
});

// ─── Taxes ────────────────────────────────────────────────────────────────────

describe('Taxes', () => {
  let createdTaxId: number;

  it('GET /api/taxes – unauthenticated returns 401', async () => {
    const r = await api('GET', '/api/taxes');
    expect(r.status).toBe(401);
  });

  it('POST /api/taxes – staff returns 403', async () => {
    const r = await api('POST', '/api/taxes', { name: 'GST', ratePercent: 18 }, staffCookie);
    expect(r.status).toBe(403);
  });

  it('POST /api/taxes – admin creates tax', async () => {
    const r = await api('POST', '/api/taxes', { name: 'Test GST', ratePercent: 18 }, adminCookie);
    expect(r.status).toBe(201);
    const body = r.body as { name: string; id: number; ratePercent: string };
    expect(body.name).toBe('Test GST');
    expect(Number(body.ratePercent)).toBe(18);
    createdTaxId = body.id;
  });

  it('POST /api/taxes – ratePercent > 100 returns 400', async () => {
    const r = await api('POST', '/api/taxes', { name: 'Invalid', ratePercent: 101 }, adminCookie);
    expect(r.status).toBe(400);
    expect((r.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/taxes – ratePercent < 0 returns 400', async () => {
    const r = await api('POST', '/api/taxes', { name: 'Neg', ratePercent: -1 }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('PUT /api/taxes/:id – admin updates', async () => {
    const r = await api('PUT', `/api/taxes/${createdTaxId}`, { ratePercent: 12 }, adminCookie);
    expect(r.status).toBe(200);
    expect(Number((r.body as { ratePercent: string }).ratePercent)).toBe(12);
  });

  it('GET /api/taxes – staff can list', async () => {
    const r = await api('GET', '/api/taxes', undefined, staffCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

// ─── Payment Terms ────────────────────────────────────────────────────────────

describe('Payment Terms', () => {
  let createdTermId: number;

  it('POST /api/payment-terms – admin creates', async () => {
    const r = await api('POST', '/api/payment-terms', { name: 'Net 30 Test', dueDays: 30 }, adminCookie);
    expect(r.status).toBe(201);
    const body = r.body as { name: string; id: number };
    expect(body.name).toBe('Net 30 Test');
    createdTermId = body.id;
  });

  it('POST /api/payment-terms – dueDays < 0 returns 400', async () => {
    const r = await api('POST', '/api/payment-terms', { name: 'Bad', dueDays: -1 }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('PUT /api/payment-terms/:id – admin updates', async () => {
    const r = await api('PUT', `/api/payment-terms/${createdTermId}`, { dueDays: 45 }, adminCookie);
    expect(r.status).toBe(200);
    expect((r.body as { dueDays: number }).dueDays).toBe(45);
  });

  it('GET /api/payment-terms – staff can list', async () => {
    const r = await api('GET', '/api/payment-terms', undefined, staffCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('POST /api/payment-terms – staff returns 403', async () => {
    const r = await api('POST', '/api/payment-terms', { name: 'Net 60', dueDays: 60 }, staffCookie);
    expect(r.status).toBe(403);
  });
});

// ─── Plans ────────────────────────────────────────────────────────────────────

describe('Plans', () => {
  let createdPlanId: number;
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  it('POST /api/plans – admin creates plan', async () => {
    const r = await api('POST', '/api/plans', { name: 'Catalog Test Plan', price: 49.99, billingPeriod: 'monthly', availableFrom: from, availableTo: to }, adminCookie);
    expect(r.status).toBe(201);
    const body = r.body as { name: string; id: number };
    expect(body.name).toBe('Catalog Test Plan');
    createdPlanId = body.id;
  });

  it('POST /api/plans – invalid billingPeriod returns 400', async () => {
    const r = await api('POST', '/api/plans', { name: 'Bad Plan', price: 10, billingPeriod: 'hourly', availableFrom: from }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('POST /api/plans – availableTo < availableFrom returns 400', async () => {
    const r = await api('POST', '/api/plans', { name: 'Date Bug', price: 10, billingPeriod: 'monthly', availableFrom: from, availableTo: past }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('GET /api/plans/:id – staff sees plan', async () => {
    const r = await api('GET', `/api/plans/${createdPlanId}`, undefined, staffCookie);
    expect(r.status).toBe(200);
    expect((r.body as { id: number }).id).toBe(createdPlanId);
  });

  it('PUT /api/plans/:id – admin updates price', async () => {
    const r = await api('PUT', `/api/plans/${createdPlanId}`, { price: 59.99 }, adminCookie);
    expect(r.status).toBe(200);
    expect(Number((r.body as { price: string }).price)).toBe(59.99);
  });

  it('POST /api/plans – staff returns 403', async () => {
    const r = await api('POST', '/api/plans', { name: 'Staff Plan', price: 10, billingPeriod: 'monthly', availableFrom: from }, staffCookie);
    expect(r.status).toBe(403);
  });
});

// ─── Discounts ────────────────────────────────────────────────────────────────

describe('Discounts', () => {
  let createdDiscountId: number;

  it('POST /api/discounts – admin creates without products', async () => {
    const r = await api('POST', '/api/discounts', { name: 'Summer Sale Test', type: 'percent', value: 10, appliesTo: 'subscription', usageLimit: 100 }, adminCookie);
    expect(r.status).toBe(201);
    const body = r.body as { name: string; id: number };
    expect(body.name).toBe('Summer Sale Test');
    createdDiscountId = body.id;
  });

  it('POST /api/discounts – value < 0 returns 400', async () => {
    const r = await api('POST', '/api/discounts', { name: 'Bad', type: 'fixed', value: -5, appliesTo: 'subscription' }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('POST /api/discounts – percent > 100 returns 400', async () => {
    const r = await api('POST', '/api/discounts', { name: 'Excess', type: 'percent', value: 110, appliesTo: 'subscription' }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('POST /api/discounts – endDate < startDate returns 400', async () => {
    const start = new Date().toISOString();
    const end = new Date(Date.now() - 86400000).toISOString();
    const r = await api('POST', '/api/discounts', { name: 'DateBug', type: 'fixed', value: 5, appliesTo: 'subscription', startDate: start, endDate: end }, adminCookie);
    expect(r.status).toBe(400);
  });

  it('PUT /api/discounts/:id – admin updates value', async () => {
    const r = await api('PUT', `/api/discounts/${createdDiscountId}`, { value: 15 }, adminCookie);
    expect(r.status).toBe(200);
    expect(Number((r.body as { value: string }).value)).toBe(15);
  });

  it('GET /api/discounts – staff can list', async () => {
    const r = await api('GET', '/api/discounts', undefined, staffCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('POST /api/discounts – staff returns 403', async () => {
    const r = await api('POST', '/api/discounts', { name: 'SD', type: 'fixed', value: 5, appliesTo: 'subscription' }, staffCookie);
    expect(r.status).toBe(403);
  });

  it('GET /api/discounts/:id – unknown returns 404', async () => {
    const r = await api('GET', '/api/discounts/99999999', undefined, adminCookie);
    expect(r.status).toBe(404);
  });
});
