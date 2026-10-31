import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from './app.js';
import http from 'http';

function makeRequest(path: string, options: http.RequestOptions = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        path,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const body = rawData ? JSON.parse(rawData) : null;
            resolve({ status: res.statusCode || 500, body });
          } catch (e) {
            resolve({ status: res.statusCode || 500, body: rawData });
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

describe('Server & Error Handling Middleware (Phase 0)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        port = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/health should return 200 and healthy status', async () => {
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 500, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('brightloop-api');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/test/validation-error returns 400 and standard error JSON format', async () => {
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/test/validation-error`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 500, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Please fix the highlighted fields.');
    expect(res.body.error.fields).toEqual({ email: 'This email is already registered.' });
    expect(res.body.error.requestId).toBeDefined();
  });

  it('GET /api/test/business-rule-error returns 422 and business rule error', async () => {
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/test/business-rule-error`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 500, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('BUSINESS_RULE_ERROR');
    expect(res.body.error.message).toBe('Cannot move a subscription from Draft to Active. Confirm it first.');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('GET /api/unknown-endpoint returns 404 NOT_FOUND', async () => {
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/unknown-endpoint`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 500, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
  });
});
