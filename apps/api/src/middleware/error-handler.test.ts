/**
 * Error Handler Tests — Sprint 6 (Team 06)
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssueCode } from 'zod';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  errorHandler,
} from './error-handler';

// Mock logger to suppress output during tests
vi.mock('../shared/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockReq = {} as Request;
const mockNext = vi.fn() as NextFunction;

describe('AppError', () => {
  it('stores statusCode, message, code, and details', () => {
    const err = new AppError(422, 'Invalid input', 'VALIDATION_FAILED', { field: 'email' });
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.details).toEqual({ field: 'email' });
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to INTERNAL_ERROR', () => {
    const err = new AppError(500, 'Boom');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.details).toBeUndefined();
  });
});

describe('NotFoundError', () => {
  it('returns 404 with formatted message', () => {
    const err = new NotFoundError('Clause', 'abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Clause with id abc-123 not found');
  });
});

describe('ForbiddenError', () => {
  it('returns 403 with default message', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Access denied');
  });

  it('accepts custom message', () => {
    const err = new ForbiddenError('Not your resource');
    expect(err.message).toBe('Not your resource');
  });
});

describe('ConflictError', () => {
  it('returns 409', () => {
    const err = new ConflictError('Email already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Email already exists');
  });
});

describe('errorHandler', () => {
  it('handles AppError with correct status and body', () => {
    const res = mockRes();
    const err = new AppError(422, 'Bad', 'BAD', { x: 1 });

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      code: 'BAD',
      message: 'Bad',
      details: { x: 1 },
    });
  });

  it('handles NotFoundError as AppError subclass', () => {
    const res = mockRes();
    const err = new NotFoundError('Template', 'xyz');

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('handles ZodError as 400 VALIDATION_ERROR', () => {
    const res = mockRes();
    const zodErr = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: 'string',
        received: 'number',
        path: ['title'],
        message: 'Expected string, received number',
      },
    ]);

    errorHandler(zodErr, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: { issues: zodErr.issues },
    });
  });

  it('handles unknown errors as 500', () => {
    const res = mockRes();
    const err = new Error('Something broke');

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
