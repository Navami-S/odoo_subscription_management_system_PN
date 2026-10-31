import { PrismaClient, UserRole, BillingPeriod, PlanStatus, DiscountType, DiscountAppliesTo, SubscriptionStatus, InvoiceStatus, PaymentMethod } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting idempotent seed...');

  // 1. Passwords (meeting RULES.md criteria: > 8 chars, 1 uppercase, 1 lowercase, 1 special char)
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('Admin@123!', salt);
  const staffPasswordHash = await bcrypt.hash('Staff@123!', salt);
  const customerPasswordHash = await bcrypt.hash('Customer@123!', salt);

  // 2. Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@brightloop.io' },
    update: {},
    create: {
      email: 'admin@brightloop.io',
      passwordHash: adminPasswordHash,
      role: UserRole.admin,
      isActive: true,
    },
  });

  // 3. Staff Users (created by admin)
  const staff1 = await prisma.user.upsert({
    where: { email: 'staff1@brightloop.io' },
    update: {},
    create: {
      email: 'staff1@brightloop.io',
      passwordHash: staffPasswordHash,
      role: UserRole.staff,
      isActive: true,
      createdBy: admin.id,
    },
  });

  const staff2 = await prisma.user.upsert({
    where: { email: 'staff2@brightloop.io' },
    update: {},
    create: {
      email: 'staff2@brightloop.io',
      passwordHash: staffPasswordHash,
      role: UserRole.staff,
      isActive: true,
      createdBy: admin.id,
    },
  });

  console.log('✓ Created 1 admin and 2 staff users');

  // 4. Taxes
  const taxesData = [
    { name: 'GST 18%', ratePercent: 18.00 },
    { name: 'VAT 5%', ratePercent: 5.00 },
    { name: 'Standard 10%', ratePercent: 10.00 },
    { name: 'Zero Tax 0%', ratePercent: 0.00 },
  ];
  const taxes: any[] = [];
  for (const t of taxesData) {
    let tax = await prisma.tax.findFirst({ where: { name: t.name } });
    if (!tax) {
      tax = await prisma.tax.create({ data: t });
    }
    taxes.push(tax);
  }
  console.log(`✓ Created ${taxes.length} taxes`);

  // 5. Payment Terms
  const termsData = [
    { name: 'Immediate', dueDays: 0 },
    { name: 'Net 15', dueDays: 15 },
    { name: 'Net 30', dueDays: 30 },
  ];
  const paymentTerms: any[] = [];
  for (const pt of termsData) {
    let term = await prisma.paymentTerm.findFirst({ where: { name: pt.name } });
    if (!term) {
      term = await prisma.paymentTerm.create({ data: pt });
    }
    paymentTerms.push(term);
  }
  console.log(`✓ Created ${paymentTerms.length} payment terms`);

  // 6. Plans
  const plansData = [
    {
      name: 'Starter Daily',
      price: 20.00,
      billingPeriod: BillingPeriod.daily,
      minQuantity: 1,
      availableFrom: new Date('2026-01-01'),
      autoCloseOnEnd: true,
      closable: true,
      pausable: true,
      renewable: true,
      status: PlanStatus.active,
    },
    {
      name: 'Standard Weekly',
      price: 120.00,
      billingPeriod: BillingPeriod.weekly,
      minQuantity: 1,
      availableFrom: new Date('2026-01-01'),
      autoCloseOnEnd: true,
      closable: true,
      pausable: true,
      renewable: true,
      status: PlanStatus.active,
    },
    {
      name: 'Professional Monthly',
      price: 450.00,
      billingPeriod: BillingPeriod.monthly,
      minQuantity: 1,
      availableFrom: new Date('2026-01-01'),
      autoCloseOnEnd: true,
      closable: true,
      pausable: true,
      renewable: true,
      status: PlanStatus.active,
    },
    {
      name: 'Enterprise Annual',
      price: 4500.00,
      billingPeriod: BillingPeriod.yearly,
      minQuantity: 1,
      availableFrom: new Date('2026-01-01'),
      autoCloseOnEnd: true,
      closable: true,
      pausable: true,
      renewable: true,
      status: PlanStatus.active,
    },
    {
      name: 'Legacy Monthly (Paused)',
      price: 350.00,
      billingPeriod: BillingPeriod.monthly,
      minQuantity: 1,
      availableFrom: new Date('2025-01-01'),
      autoCloseOnEnd: false,
      closable: true,
      pausable: true,
      renewable: false,
      status: PlanStatus.paused,
    },
    {
      name: 'Archived Beta Plan',
      price: 100.00,
      billingPeriod: BillingPeriod.monthly,
      minQuantity: 5,
      availableFrom: new Date('2024-01-01'),
      availableTo: new Date('2025-01-01'),
      autoCloseOnEnd: true,
      closable: false,
      pausable: false,
      renewable: false,
      status: PlanStatus.closed,
    },
  ];

  const plans: any[] = [];
  for (const p of plansData) {
    let plan = await prisma.plan.findFirst({ where: { name: p.name } });
    if (!plan) {
      plan = await prisma.plan.create({ data: p });
    }
    plans.push(plan);
  }
  console.log(`✓ Created ${plans.length} plans`);

  // 7. 12 Products with Variants
  const productsData = [
    { name: 'Brightloop ERP Core', type: 'software', salesPrice: 1200.00, costPrice: 200.00, notes: 'Flagship enterprise resource planning' },
    { name: 'Brightloop CRM Pro', type: 'software', salesPrice: 800.00, costPrice: 150.00, notes: 'Sales pipeline and lead management' },
    { name: 'Accounting & Invoicing', type: 'software', salesPrice: 650.00, costPrice: 100.00, notes: 'Tax-ready financial ledgers' },
    { name: 'Inventory & Barcode', type: 'software', salesPrice: 450.00, costPrice: 80.00, notes: 'Warehouse tracking' },
    { name: 'Point of Sale (POS)', type: 'software', salesPrice: 500.00, costPrice: 90.00, notes: 'Retail register system' },
    { name: 'HR & Payroll Manager', type: 'software', salesPrice: 550.00, costPrice: 90.00, notes: 'Employee attendance and salaries' },
    { name: 'Project & Task Suite', type: 'software', salesPrice: 350.00, costPrice: 50.00, notes: 'Agile team collaboration' },
    { name: 'E-Commerce Hub', type: 'software', salesPrice: 400.00, costPrice: 70.00, notes: 'Storefront sync' },
    { name: 'Dedicated Cloud Server', type: 'service', salesPrice: 300.00, costPrice: 120.00, notes: 'Isolated high-performance hosting' },
    { name: 'Priority 24/7 SLA Support', type: 'service', salesPrice: 250.00, costPrice: 50.00, notes: '1-hour guaranteed incident response' },
    { name: 'Custom Webhook Connectors', type: 'addon', salesPrice: 150.00, costPrice: 30.00, notes: 'REST integration bridge' },
    { name: 'Data Migration & Onboarding', type: 'service', salesPrice: 950.00, costPrice: 300.00, notes: 'White-glove implementation' },
  ];

  const products: any[] = [];
  for (const prod of productsData) {
    let p = await prisma.product.findFirst({ where: { name: prod.name } });
    if (!p) {
      p = await prisma.product.create({ data: prod });
    }
    products.push(p);
  }

  // Variants (brand = Odoo adds +560.00 per Section 1.2 & 7.4)
  const erpCore = products[0];
  await prisma.productVariant.upsert({
    where: {
      productId_attribute_value: {
        productId: erpCore.id,
        attribute: 'Brand',
        value: 'Odoo',
      },
    },
    update: {},
    create: {
      productId: erpCore.id,
      attribute: 'Brand',
      value: 'Odoo',
      extraPrice: 560.00,
    },
  });

  await prisma.productVariant.upsert({
    where: {
      productId_attribute_value: {
        productId: erpCore.id,
        attribute: 'Brand',
        value: 'Standard',
      },
    },
    update: {},
    create: {
      productId: erpCore.id,
      attribute: 'Brand',
      value: 'Standard',
      extraPrice: 0.00,
    },
  });

  const crmPro = products[1];
  await prisma.productVariant.upsert({
    where: {
      productId_attribute_value: {
        productId: crmPro.id,
        attribute: 'Tier',
        value: 'Enterprise',
      },
    },
    update: {},
    create: {
      productId: crmPro.id,
      attribute: 'Tier',
      value: 'Enterprise',
      extraPrice: 300.00,
    },
  });
  console.log(`✓ Created ${products.length} products with variants (including Odoo +560.00 variant)`);

  // 8. 5 Discounts
  const discountsData = [
    {
      name: 'Welcome Promo 10%',
      type: DiscountType.percent,
      value: 10.00,
      usageLimit: 100,
      usedCount: 12,
      appliesTo: DiscountAppliesTo.subscription,
      isActive: true,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
    {
      name: 'Flat $100 Off Enterprise',
      type: DiscountType.fixed,
      value: 100.00,
      usageLimit: 50,
      usedCount: 48, // Near limit
      appliesTo: DiscountAppliesTo.subscription,
      isActive: true,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
    {
      name: 'Summer 2025 Special (Expired)',
      type: DiscountType.percent,
      value: 15.00,
      usageLimit: 200,
      usedCount: 198,
      appliesTo: DiscountAppliesTo.subscription,
      isActive: false, // Expired
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-08-31'),
    },
    {
      name: 'Odoo ERP Upgrade Promo',
      type: DiscountType.fixed,
      value: 60.00,
      usageLimit: 30,
      usedCount: 5,
      appliesTo: DiscountAppliesTo.product,
      isActive: true,
    },
    {
      name: 'High-Volume Saver 20%',
      type: DiscountType.percent,
      value: 20.00,
      minPurchase: 1000.00,
      usageLimit: 20,
      usedCount: 19, // Near limit
      appliesTo: DiscountAppliesTo.subscription,
      isActive: true,
    },
  ];

  const discounts: any[] = [];
  for (const d of discountsData) {
    let disc = await prisma.discount.findFirst({ where: { name: d.name } });
    if (!disc) {
      disc = await prisma.discount.create({ data: d });
    }
    discounts.push(disc);
  }

  // Link product discount to Brightloop ERP Core in join table
  await prisma.discountProduct.upsert({
    where: {
      discountId_productId: {
        discountId: discounts[3].id,
        productId: erpCore.id,
      },
    },
    update: {},
    create: {
      discountId: discounts[3].id,
      productId: erpCore.id,
    },
  });
  console.log(`✓ Created ${discounts.length} discounts with M:N product linkage`);

  // 9. 3 Quotation Templates
  const template1 = await prisma.quotationTemplate.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Standard SaaS Suite',
      planId: plans[2].id, // Professional Monthly
      validityDays: 30,
      lines: {
        create: [
          { productId: products[0].id, quantity: 1 },
          { productId: products[1].id, quantity: 1 },
        ],
      },
    },
  });

  const template2 = await prisma.quotationTemplate.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: 'Complete Enterprise Solution',
      planId: plans[3].id, // Enterprise Annual
      validityDays: 45,
      lines: {
        create: [
          { productId: products[0].id, quantity: 2 },
          { productId: products[8].id, quantity: 1 },
          { productId: products[9].id, quantity: 1 },
        ],
      },
    },
  });

  const template3 = await prisma.quotationTemplate.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      name: 'Starter Business Pack',
      planId: plans[1].id, // Standard Weekly
      validityDays: 15,
      lines: {
        create: [
          { productId: products[1].id, quantity: 1 },
          { productId: products[3].id, quantity: 1 },
        ],
      },
    },
  });
  console.log('✓ Created 3 quotation templates with pre-configured lines');

  // 10. 50 Customers with Users and CRM Profiles
  console.log('Creating 50 customers...');
  const customers: any[] = [];
  for (let i = 1; i <= 50; i++) {
    const email = `customer${i}@brightloop.io`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: customerPasswordHash,
        role: UserRole.customer,
        isActive: true,
      },
    });

    const customer = await prisma.customer.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: `Acme Corp ${i}`,
        phone: `+1-555-01${i.toString().padStart(2, '0')}`,
        company: `Client Global ${i} Ltd`,
        street: `${100 + i} Innovation Way`,
        city: i % 2 === 0 ? 'San Francisco' : 'New York',
        state: i % 2 === 0 ? 'CA' : 'NY',
        postalCode: `${94000 + i}`,
        country: 'USA',
      },
    });
    customers.push(customer);
  }
  console.log(`✓ Created ${customers.length} customer accounts`);

  // 11. Subscriptions in various lifecycle states (Draft, Quotation, Confirmed, Active, Closed)
  const subStatuses = [
    SubscriptionStatus.draft,
    SubscriptionStatus.quotation,
    SubscriptionStatus.confirmed,
    ...Array(15).fill(SubscriptionStatus.active),
    SubscriptionStatus.closed,
    SubscriptionStatus.closed,
  ];

  console.log('Creating subscriptions, invoices, and payments...');
  for (let i = 0; i < subStatuses.length; i++) {
    const num = `SUB-2026-${(i + 1).toString().padStart(6, '0')}`;
    const cust = customers[i % customers.length];
    const plan = plans[i % plans.length];
    const status = subStatuses[i];
    const isDue = i % 3 === 0;

    let sub = await prisma.subscription.findUnique({ where: { number: num } });
    if (!sub) {
      sub = await prisma.subscription.create({
        data: {
          number: num,
          customerId: cust.id,
          planId: plan.id,
          paymentTermId: paymentTerms[i % paymentTerms.length].id,
          startDate: new Date('2026-01-01'),
          expiryDate: new Date('2026-12-31'),
          status,
          nextBillingDate: status === SubscriptionStatus.active ? (isDue ? new Date('2026-10-31') : new Date('2026-11-30')) : null,
          createdBy: staff1.id,
          lines: {
            create: [
              {
                productId: products[i % products.length].id,
                quantity: 1,
                unitPrice: products[i % products.length].salesPrice,
                taxId: taxes[0].id,
                amount: products[i % products.length].salesPrice,
              },
            ],
          },
          statusHistory: {
            create: [
              {
                fromStatus: SubscriptionStatus.draft,
                toStatus: status,
                changedBy: staff1.id,
              },
            ],
          },
        },
      });

      // Generate invoice for Active/Closed subscriptions
      if (status === SubscriptionStatus.active || status === SubscriptionStatus.closed) {
        const invNum = `INV-2026-${(i + 1).toString().padStart(6, '0')}`;
        const periodStart = new Date('2026-10-01T00:00:00.000Z');
        const periodEnd = new Date('2026-10-31T23:59:59.000Z');
        const amount = Number(products[i % products.length].salesPrice);
        const taxRate = 18.00;
        const taxAmount = (amount * taxRate) / 100;
        const total = amount + taxAmount;
        const isPaid = i % 2 === 0;

        const invoice = await prisma.invoice.create({
          data: {
            number: invNum,
            subscriptionId: sub.id,
            customerId: cust.id,
            periodStart,
            periodEnd,
            issueDate: new Date('2026-10-01'),
            dueDate: new Date('2026-10-16'),
            status: isPaid ? InvoiceStatus.paid : InvoiceStatus.confirmed,
            subtotal: amount,
            taxTotal: taxAmount,
            discountTotal: 0.00,
            total,
            amountPaid: isPaid ? total : 0.00,
            lines: {
              create: [
                {
                  productId: products[i % products.length].id,
                  description: `${products[i % products.length].name} - Monthly Subscription`,
                  quantity: 1,
                  unitPrice: amount,
                  taxRateSnapshot: taxRate,
                  discountAmount: 0.00,
                  lineTotal: amount,
                },
              ],
            },
          },
        });

        // Record payment if paid
        if (isPaid) {
          await prisma.payment.create({
            data: {
              invoiceId: invoice.id,
              method: PaymentMethod.card,
              amount: total,
              paidOn: new Date('2026-10-05'),
              note: 'Automated card payment processed successfully',
              recordedBy: staff1.id,
            },
          });
        }
      }
    }
  }

  console.log('✓ Created subscriptions, invoice snapshot lines, and payments');
  console.log('✨ Seed completed idempotently!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

