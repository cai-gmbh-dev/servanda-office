import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Sets the tenant context on the current database connection.
 * Must be called within a Prisma interactive transaction to use RLS.
 *
 * Usage:
 *   await prisma.$transaction(async (tx) => {
 *     await setTenantContext(tx, tenantId);
 *     // All subsequent queries in this tx are tenant-scoped via RLS
 *   });
 */
export async function setTenantContext(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  tenantId: string,
): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  logger.debug({ tenantId }, 'Tenant context set');
}
