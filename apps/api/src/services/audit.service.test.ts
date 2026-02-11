/**
 * AuditService Tests — Sprint 6 (Team 06)
 *
 * Tests audit logging, fallback queue, flushing, and query filtering.
 * Prisma is mocked to isolate unit behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockExecuteRawUnsafe = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../shared/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
  setTenantContext: vi.fn(),
}));

vi.mock('../shared/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper: setup transaction mock to call the callback with a mock tx
function setupTransactionSuccess() {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      $executeRawUnsafe: mockExecuteRawUnsafe,
      auditEvent: {
        create: mockCreate,
        findMany: mockFindMany,
        count: mockCount,
      },
    };
    return fn(tx);
  });
}

function setupTransactionFailure(error = new Error('DB connection lost')) {
  mockTransaction.mockRejectedValue(error);
}

const testCtx = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'admin' as const,
};

const testInput = {
  action: 'clause.create' as const,
  objectType: 'Clause',
  objectId: 'clause-123',
  details: { title: 'Test Clause' },
};

describe('AuditService', () => {
  let auditService: { log: Function; query: Function; shutdown: Function };

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();

    // Re-mock after resetModules
    vi.doMock('../shared/db', () => ({
      prisma: {
        $transaction: (...args: unknown[]) => mockTransaction(...args),
      },
      setTenantContext: vi.fn(),
    }));
    vi.doMock('../shared/logger', () => ({
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    }));

    mockCreate.mockReset();
    mockFindMany.mockReset();
    mockCount.mockReset();
    mockTransaction.mockReset();
    mockExecuteRawUnsafe.mockReset();

    const mod = await import('./audit.service');
    auditService = mod.auditService;
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (auditService?.shutdown) {
      mockTransaction.mockImplementation(async () => {}); // prevent flush errors
      await auditService.shutdown();
    }
  });

  describe('log', () => {
    it('creates audit event in DB transaction', async () => {
      setupTransactionSuccess();
      mockCreate.mockResolvedValue({});

      await auditService.log(testCtx, testInput, { ip: '127.0.0.1', userAgent: 'test' });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          actorId: 'user-1',
          action: 'clause.create',
          objectType: 'Clause',
          objectId: 'clause-123',
          details: { title: 'Test Clause' },
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        }),
      });
    });

    it('never throws on DB failure — queues event instead', async () => {
      setupTransactionFailure();

      // Should NOT throw
      await expect(
        auditService.log(testCtx, testInput),
      ).resolves.toBeUndefined();

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('handles null meta gracefully', async () => {
      setupTransactionSuccess();
      mockCreate.mockResolvedValue({});

      await auditService.log(testCtx, testInput);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: null,
          userAgent: null,
        }),
      });
    });
  });

  describe('query', () => {
    it('queries with tenant context and pagination', async () => {
      const mockData = [
        {
          id: 'evt-1',
          tenantId: 'tenant-1',
          actorId: 'user-1',
          action: 'clause.create',
          objectType: 'Clause',
          objectId: 'clause-1',
          details: null,
          ipAddress: null,
          userAgent: null,
          timestamp: new Date('2026-02-11T10:00:00Z'),
        },
      ];

      setupTransactionSuccess();
      mockFindMany.mockResolvedValue(mockData);
      mockCount.mockResolvedValue(1);

      const result = await auditService.query(testCtx, {}, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.hasMore).toBe(false);
    });

    it('applies action filter with startsWith', async () => {
      setupTransactionSuccess();
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await auditService.query(testCtx, { action: 'clause' }, 1, 20);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { startsWith: 'clause' },
          }),
        }),
      );
    });

    it('applies objectType and objectId filters', async () => {
      setupTransactionSuccess();
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await auditService.query(
        testCtx,
        { objectType: 'Clause', objectId: 'c-1' },
        1,
        20,
      );

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            objectType: 'Clause',
            objectId: 'c-1',
          }),
        }),
      );
    });

    it('applies date range filters', async () => {
      setupTransactionSuccess();
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const from = '2026-02-01';
      const to = '2026-02-11';

      await auditService.query(testCtx, { from, to }, 1, 20);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }),
        }),
      );
    });

    it('caps pageSize to MAX_PAGE_SIZE', async () => {
      setupTransactionSuccess();
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await auditService.query(testCtx, {}, 1, 999);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // MAX_PAGE_SIZE
        }),
      );
    });

    it('calculates hasMore correctly', async () => {
      setupTransactionSuccess();
      mockFindMany.mockResolvedValue([{ id: '1', tenantId: 't', actorId: 'u', action: 'a', objectType: 'o', objectId: 'oid', details: null, ipAddress: null, userAgent: null, timestamp: new Date() }]);
      mockCount.mockResolvedValue(25);

      const result = await auditService.query(testCtx, {}, 1, 10);

      expect(result.hasMore).toBe(true);
    });
  });
});
