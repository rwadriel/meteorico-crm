import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from '../errors.js';

describe('AppError', () => {
  it('sets message, code, and statusCode', () => {
    const err = new AppError('boom', 'BOOM', 500);
    expect(err.message).toBe('boom');
    expect(err.code).toBe('BOOM');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('accepts optional details', () => {
    const err = new AppError('x', 'X', 400, { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });
});

describe('ValidationError', () => {
  it('has code VALIDATION_ERROR and status 400', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ValidationError');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  it('formats message with resource and id', () => {
    const err = new NotFoundError('Contact', '123');
    expect(err.message).toBe('Contact not found: 123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('formats message without id', () => {
    const err = new NotFoundError('Contact');
    expect(err.message).toBe('Contact not found');
  });
});

describe('UnauthorizedError', () => {
  it('defaults to 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.name).toBe('UnauthorizedError');
  });
});

describe('ForbiddenError', () => {
  it('defaults to 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.name).toBe('ForbiddenError');
  });
});

describe('ConflictError', () => {
  it('has status 409', () => {
    const err = new ConflictError('duplicate entry');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
  });
});
