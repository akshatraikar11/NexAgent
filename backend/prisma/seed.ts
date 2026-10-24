/**
 * prisma/seed.ts — NexAgent development database seed
 *
 * Creates the initial admin user using the password from ADMIN_PASSWORD env var.
 * Idempotent: uses upsert so it is safe to run multiple times.
 *
 * Usage:
 *   npx prisma migrate dev     # ensure schema is applied
 *   npm run db:seed            # run this script
 *
 * Requires ADMIN_PASSWORD to be set in .env (never hard-coded here).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD environment variable is not set. ' +
      'Add it to backend/.env before running the seed script.'
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const emails = ['admin@nexagent.dev', 'admin@nexagent.ai'];
  for (const email of emails) {
    const admin = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        name: 'NexAgent Admin',
        role: 'ADMIN',
      },
      create: {
        email,
        name: 'NexAgent Admin',
        passwordHash,
        role: 'ADMIN',
      },
    });
    console.log(`[SEED] Admin user ready: ${admin.email} (role: ${admin.role}, id: ${admin.id})`);
  }

  // Seed standard IT categories — these are required for the historicalErrorRate feedback loop.
  // Each category accumulates overrideCount/totalDecisions from the Approvals page.
  const STANDARD_CATEGORIES = [
    { name: 'IT_SUPPORT',     description: 'IT helpdesk, password resets, device provisioning' },
    { name: 'BILLING',        description: 'Billing disputes, refunds, invoice issues — PCI-sensitive' },
    { name: 'INFRASTRUCTURE', description: 'Production infra, outages, deployments, database issues' },
    { name: 'SECURITY',       description: 'Security incidents, access requests, firewall rules' },
    { name: 'GENERAL',        description: 'Uncategorized or multi-category tickets' },
  ];

  for (const cat of STANDARD_CATEGORIES) {
    const result = await prisma.category.upsert({
      where: { name: cat.name },
      update: { description: cat.description },
      create: cat,
    });
    console.log(`[SEED] Category ready: ${result.name} (id: ${result.id})`);
  }
}

main()
  .catch((err) => {
    console.error('[SEED] Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
