import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting bulk generation for 10,000+ subscriptions (Section 7.4)...');

  // Verify prerequisites exist (customer, plan, payment term)
  const customer = await prisma.customer.findFirst();
  const plan = await prisma.plan.findFirst({ where: { status: 'active' } });
  const paymentTerm = await prisma.paymentTerm.findFirst();
  const staff = await prisma.user.findFirst({ where: { role: 'staff' } });

  if (!customer || !plan || !paymentTerm) {
    console.error('❌ Base seed data missing. Run `npm run seed` first.');
    process.exit(1);
  }

  const customerId = customer.id;
  const planId = plan.id;
  const paymentTermId = paymentTerm.id;
  const staffId = staff ? staff.id : 1;

  const totalToGenerate = 10000;
  const batchSize = 1000;
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  console.log(`Generating ${totalToGenerate} subscriptions in batches of ${batchSize}...`);

  const startTime = Date.now();

  for (let b = 0; b < totalToGenerate; b += batchSize) {
    const subValues: string[] = [];
    for (let i = 1; i <= batchSize; i++) {
      const idx = b + i;
      const num = `SUB-BLK-${idx.toString().padStart(6, '0')}`;
      const status = idx % 5 === 0 ? 'closed' : 'active';
      const isDue = idx % 3 === 0;
      const nextBilling = status === 'active' 
        ? (isDue ? "'2026-10-31 00:00:00'" : "'2026-11-30 00:00:00'") 
        : 'NULL';

      subValues.push(
        `('${num}', ${customerId}, ${planId}, ${paymentTermId}, '2026-01-01 00:00:00', '2026-12-31 23:59:59', '${status}', ${nextBilling}, ${staffId}, '${timestamp}', '${timestamp}')`
      );
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO subscriptions (number, customer_id, plan_id, payment_term_id, start_date, expiry_date, status, next_billing_date, created_by, created_at, updated_at)
      VALUES ${subValues.join(',\n')}
      ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)
    `);

    process.stdout.write(`  ✓ Subscriptions ${b + batchSize}/${totalToGenerate}\r`);
  }
  console.log(`\n✓ Generated ${totalToGenerate} subscriptions in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  // Count total subscriptions in database
  const count = await prisma.subscription.count();
  console.log(`📊 Total Subscriptions in DB: ${count}`);

  console.log('⚡ Running EXPLAIN ANALYZE on index-accelerated billing queries...');

  // EXPLAIN ANALYZE on Section 7.2 index: subscriptions(status, next_billing_date)
  const explainSub = await prisma.$queryRawUnsafe<any[]>(`
    EXPLAIN ANALYZE
    SELECT id, number, next_billing_date
    FROM subscriptions
    WHERE status = 'active' AND next_billing_date <= '2026-10-31 23:59:59'
    LIMIT 100
  `);
  console.log('EXPLAIN ANALYZE (subscriptions status + next_billing_date index):');
  console.log(explainSub);

  console.log('✨ Bulk generation and verification completed successfully!');
}

main()
  .catch((e) => {
    console.error('Bulk seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

