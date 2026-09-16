import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

// Global flag to track if DB is available (tested on first query attempt)
let isDbAvailable: boolean | null = null;

export async function isDatabaseConnected(): Promise<boolean> {
  if (isDbAvailable !== null) {
    return isDbAvailable;
  }

  try {
    // Quick probe with a 500ms timeout
    const probePromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB probe timeout')), 500)
    );

    await Promise.race([probePromise, timeoutPromise]);
    isDbAvailable = true;
    logger.info('[DATABASE] Postgres connection verified successfully.');
    return true;
  } catch (error) {
    isDbAvailable = false;
    logger.warn('[DATABASE] Postgres server unreachable — running in memory/mock persistence mode.');
    return false;
  }
}

// Reset DB availability state for testing
export function resetDbState(): void {
  isDbAvailable = null;
}
