import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('MySQL 8.0.16+ Database Invariant & Constraint Tests (Section 7.5)', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Verifies MySQL version is 8.0.16 or higher (CHECK constraints actively enforced)', async () => {
    const result = await prisma.$queryRaw<Array<{ version: string }>>`SELECT VERSION() as version`;
    expect(result.length).toBeGreaterThan(0);
    const versionString = result[0].version;
    const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)/);
    expect(match).not.toBeNull();
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      const patch = parseInt(match[3], 10);
      const isAtLeast8016 =
        major > 8 ||
        (major === 8 && minor > 0) ||
        (major === 8 && minor === 0 && patch >= 16);
      expect(isAtLeast8016).toBe(true);
    }
  });

  it('2. Verifies all application tables use InnoDB storage engine', async () => {
    const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string; ENGINE: string }>>`
      SELECT TABLE_NAME, ENGINE 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != '_prisma_migrations'
    `;
    expect(tables.length).toBeGreaterThanOrEqual(20);
    for (const t of tables) {
      expect(t.ENGINE).toBe('InnoDB');
    }
  });

  it('3. Rejects negative product sales price with CHECK constraint violation', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO products (name, type, sales_price, cost_price, is_active, created_at, updated_at)
        VALUES ('Invalid Negative Product', 'software', -50.00, 10.00, true, NOW(), NOW())
      `
    ).rejects.toThrow();
  });

  it('4. Rejects invalid subscription dates (expiry_date before start_date)', async () => {
    // Create prerequisite user & customer & plan & payment term
    const user = await prisma.user.create({
      data: {
        email: `date-test-${Date.now()}@brightloop.io`,
        passwordHash: 'dummy-hash',
        role: 'customer',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        name: 'Date Test Customer',
      },
    });

    const plan = await prisma.plan.create({
      data: {
        name: `Date Plan ${Date.now()}`,
        price: 99.00,
        billingPeriod: 'monthly',
        availableFrom: new Date(),
      },
    });

    const paymentTerm = await prisma.paymentTerm.create({
      data: {
        name: `Term ${Date.now()}`,
        dueDays: 15,
      },
    });

    // Attempt insert with expiry_date < start_date
    await expect(
      prisma.$executeRaw`
        INSERT INTO subscriptions (number, customer_id, plan_id, payment_term_id, start_date, expiry_date, status, created_at, updated_at)
        VALUES (${`SUB-ERR-${Date.now()}`}, ${customer.id}, ${plan.id}, ${paymentTerm.id}, '2026-10-01', '2026-09-01', 'draft', NOW(), NOW())
      `
    ).rejects.toThrow();
  });

  it('5. Rejects duplicate user email (UNIQUE constraint)', async () => {
    const email = `unique-test-${Date.now()}@brightloop.io`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: 'hash1',
        role: 'customer',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          email,
          passwordHash: 'hash2',
          role: 'customer',
        },
      })
    ).rejects.toThrow();
  });

  it('6. Rejects duplicate invoice for same subscription & period_start (UNIQUE (subscription_id, period_start))', async () => {
    const user = await prisma.user.create({
      data: {
        email: `inv-test-${Date.now()}@brightloop.io`,
        passwordHash: 'dummy-hash',
        role: 'customer',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        name: 'Invoice Test Customer',
      },
    });

    const plan = await prisma.plan.create({
      data: {
        name: `Invoice Plan ${Date.now()}`,
        price: 199.00,
        billingPeriod: 'monthly',
        availableFrom: new Date(),
      },
    });

    const paymentTerm = await prisma.paymentTerm.create({
      data: {
        name: `Term ${Date.now()}`,
        dueDays: 30,
      },
    });

    const subscription = await prisma.subscription.create({
      data: {
        number: `SUB-INV-${Date.now()}`,
        customerId: customer.id,
        planId: plan.id,
        paymentTermId: paymentTerm.id,
        startDate: new Date('2026-01-01'),
        expiryDate: new Date('2026-12-31'),
        status: 'active',
      },
    });

    const periodStart = new Date('2026-02-01T00:00:00.000Z');
    const periodEnd = new Date('2026-02-28T23:59:59.000Z');

    // First invoice should succeed
    await prisma.invoice.create({
      data: {
        number: `INV-TEST-A-${Date.now()}`,
        subscriptionId: subscription.id,
        customerId: customer.id,
        periodStart,
        periodEnd,
        issueDate: new Date(),
        dueDate: new Date(),
        subtotal: 199.00,
        total: 199.00,
      },
    });

    // Second invoice with IDENTICAL (subscription_id, period_start) MUST fail
    await expect(
      prisma.invoice.create({
        data: {
          number: `INV-TEST-B-${Date.now()}`,
          subscriptionId: subscription.id,
          customerId: customer.id,
          periodStart,
          periodEnd,
          issueDate: new Date(),
          dueDate: new Date(),
          subtotal: 199.00,
          total: 199.00,
        },
      })
    ).rejects.toThrow();
  });

  it('7. Rejects discount when used_count exceeds usage_limit (CHECK constraint)', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO discounts (name, type, value, usage_limit, used_count, applies_to, is_active, created_at, updated_at)
        VALUES ('Overused Discount', 'fixed', 50.00, 5, 10, 'subscription', true, NOW(), NOW())
      `
    ).rejects.toThrow();
  });

  it('8. Rejects non-positive payment amount <= 0 (CHECK constraint)', async () => {
    const user = await prisma.user.create({
      data: {
        email: `pay-test-${Date.now()}@brightloop.io`,
        passwordHash: 'dummy-hash',
        role: 'customer',
      },
    });

    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        name: 'Pay Test Customer',
      },
    });

    const plan = await prisma.plan.create({
      data: {
        name: `Pay Plan ${Date.now()}`,
        price: 50.00,
        billingPeriod: 'monthly',
        availableFrom: new Date(),
      },
    });

    const paymentTerm = await prisma.paymentTerm.create({
      data: {
        name: `Term ${Date.now()}`,
        dueDays: 0,
      },
    });

    const subscription = await prisma.subscription.create({
      data: {
        number: `SUB-PAY-${Date.now()}`,
        customerId: customer.id,
        planId: plan.id,
        paymentTermId: paymentTerm.id,
        startDate: new Date('2026-01-01'),
        expiryDate: new Date('2026-12-31'),
        status: 'active',
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-PAY-${Date.now()}`,
        subscriptionId: subscription.id,
        customerId: customer.id,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
        issueDate: new Date(),
        dueDate: new Date(),
        subtotal: 50.00,
        total: 50.00,
      },
    });

    // Zero payment rejected
    await expect(
      prisma.$executeRaw`
        INSERT INTO payments (invoice_id, method, amount, paid_on, created_at)
        VALUES (${invoice.id}, 'card', 0.00, NOW(), NOW())
      `
    ).rejects.toThrow();

    // Negative payment rejected
    await expect(
      prisma.$executeRaw`
        INSERT INTO payments (invoice_id, method, amount, paid_on, created_at)
        VALUES (${invoice.id}, 'card', -25.00, NOW(), NOW())
      `
    ).rejects.toThrow();
  });

  it('9. Rejects tax rate percent outside 0 to 100 bound (CHECK constraint)', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO taxes (name, rate_percent, is_active, created_at, updated_at)
        VALUES ('Out of Bounds Tax', 150.00, true, NOW(), NOW())
      `
    ).rejects.toThrow();
  });
});
