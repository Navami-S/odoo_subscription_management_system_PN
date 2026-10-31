import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from './app.js';
import { prisma } from './utils/prisma.js';

const PORT = 5099;
let server: http.Server;

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
              status: res.statusCode || 500,
              body: data ? JSON.parse(data) : null,
              setCookie: res.headers['set-cookie']?.[0],
            });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
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

// ── Unique email per test run
const ts = Date.now();
const customerEmail = `customer-${ts}@test.io`;
const customerPwd = 'Test@1234!';
const staffEmail = `staff-${ts}@test.io`;
const adminEmail = 'admin@brightloop.io';
const adminPwd = 'Admin@123!';

describe('POST /api/auth/signup – password rules', () => {
  it('rejects password with 8 chars exactly (must be > 8)', async () => {
    const r = await api('POST', '/api/auth/signup', { email: `pw8-${ts}@test.io`, password: 'Abc!1234', name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.fields?.password).toBeTruthy();
  });

  it('rejects password missing uppercase', async () => {
    const r = await api('POST', '/api/auth/signup', { email: `noup-${ts}@test.io`, password: 'test@1234!', name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.error.fields?.password).toMatch(/uppercase/i);
  });

  it('rejects password missing lowercase', async () => {
    const r = await api('POST', '/api/auth/signup', { email: `nolw-${ts}@test.io`, password: 'TEST@1234!', name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.error.fields?.password).toMatch(/lowercase/i);
  });

  it('rejects password missing special character', async () => {
    const r = await api('POST', '/api/auth/signup', { email: `nosp-${ts}@test.io`, password: 'TestAbc1234', name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.error.fields?.password).toMatch(/special/i);
  });
});

describe('POST /api/auth/signup – success and conflict', () => {
  it('creates customer user and returns httpOnly cookie on valid signup', async () => {
    const r = await api('POST', '/api/auth/signup', { email: customerEmail, password: customerPwd, name: 'Test Customer' });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe(customerEmail);
    expect(r.body.user.role).toBe('customer');
    expect(r.body.user.customer).toBeTruthy();
    expect(r.setCookie).toMatch(/token=/);
    expect(r.setCookie).toMatch(/HttpOnly/i);
  });

  it('returns 409 Conflict for duplicate email', async () => {
    const r = await api('POST', '/api/auth/signup', { email: customerEmail, password: customerPwd, name: 'Dup' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONFLICT');
    expect(r.body.error.fields?.email).toBeTruthy();
  });
});

describe('POST /api/auth/login', () => {
  it('returns generic 401 for wrong email', async () => {
    const r = await api('POST', '/api/auth/login', { email: 'nobody@test.io', password: customerPwd });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid email or password.');
  });

  it('returns generic 401 for wrong password (same message)', async () => {
    const r = await api('POST', '/api/auth/login', { email: customerEmail, password: 'WrongPass!1' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid email or password.');
  });

  it('returns 200 and sets httpOnly cookie for valid credentials', async () => {
    const r = await api('POST', '/api/auth/login', { email: customerEmail, password: customerPwd });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(customerEmail);
    expect(r.setCookie).toMatch(/token=/);
    expect(r.setCookie).toMatch(/HttpOnly/i);
  });
});

let customerCookie = '';
let adminCookie = '';

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  it('/me returns 401 without a cookie', async () => {
    const r = await api('GET', '/api/auth/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
  });

  it('/me returns current user when authenticated', async () => {
    const login = await api('POST', '/api/auth/login', { email: customerEmail, password: customerPwd });
    customerCookie = login.setCookie!.split(';')[0];
    const r = await api('GET', '/api/auth/me', undefined, customerCookie);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(customerEmail);
    expect(r.body.user.role).toBe('customer');
  });

  it('logout clears cookie', async () => {
    const r = await api('POST', '/api/auth/logout', undefined, customerCookie);
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/logged out/i);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 for non-existent email (no user enumeration)', async () => {
    const r = await api('POST', '/api/auth/forgot-password', { email: 'nobody@test.io' });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/if an account exists/i);
  });

  it('returns same 200 for existing email', async () => {
    const r = await api('POST', '/api/auth/forgot-password', { email: customerEmail });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/if an account exists/i);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('returns 400 for invalid or expired token', async () => {
    const r = await api('POST', '/api/auth/reset-password', { token: 'invalidtoken123', newPassword: 'NewPass@99!' });
    expect(r.status).toBe(400);
    expect(r.body.error.fields?.token).toMatch(/invalid or expired/i);
  });
});

describe('POST /api/users/staff – Admin role guard', () => {
  beforeAll(async () => {
    const login = await api('POST', '/api/auth/login', { email: adminEmail, password: adminPwd });
    adminCookie = login.setCookie!.split(';')[0];
    const custLogin = await api('POST', '/api/auth/login', { email: customerEmail, password: customerPwd });
    customerCookie = custLogin.setCookie!.split(';')[0];
  });

  it('returns 403 Forbidden when a customer tries to create staff', async () => {
    const r = await api('POST', '/api/users/staff', { email: `forbid-${ts}@test.io`, password: 'Staff@12!', name: 'Bad Actor' }, customerCookie);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  it('Admin successfully creates a staff account', async () => {
    const r = await api('POST', '/api/users/staff', { email: staffEmail, password: 'Staff@12!', name: 'New Staff' }, adminCookie);
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe(staffEmail);
    expect(r.body.user.role).toBe('staff');
  });

  it('Staff cannot create another staff account (403)', async () => {
    const staffLogin = await api('POST', '/api/auth/login', { email: staffEmail, password: 'Staff@12!' });
    const staffCookie = staffLogin.setCookie!.split(';')[0];
    const r = await api('POST', '/api/users/staff', { email: `s2-${ts}@test.io`, password: 'Staff@12!', name: 'S2' }, staffCookie);
    expect(r.status).toBe(403);
  });

  it('401 without auth for staff creation', async () => {
    const r = await api('POST', '/api/users/staff', { email: `noauth-${ts}@test.io`, password: 'Staff@12!', name: 'X' });
    expect(r.status).toBe(401);
  });
});
