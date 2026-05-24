import { describe, it, expect } from 'vitest';
import { ServiceError, getErrorMessage, getErrorStack } from '../../../server/utils/ServiceError';

describe('ServiceError', () => {
  describe('constructor', () => {
    it('constructs with message and code', () => {
      const err = new ServiceError('test error', undefined, 400, 'TEST_CODE');
      expect(err.message).toBe('test error');
      expect(err.code).toBe('TEST_CODE');
      expect(err.statusCode).toBe(400);
    });

    it('uses default statusCode and code when not provided', () => {
      const err = new ServiceError('default error');
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('INTERNAL_ERROR');
    });

    it('preserves stack trace from original error', () => {
      const original = new Error('original');
      const err = new ServiceError('wrapped', original);
      expect(err.stack).toBe(original.stack);
    });

    it('sets details and context', () => {
      const err = new ServiceError('detail', undefined, 400, 'CODE', { field: 'name' }, { userId: '1' });
      expect(err.details).toEqual({ field: 'name' });
      expect(err.context).toEqual({ userId: '1' });
    });
  });

  describe('instanceof checks', () => {
    it('is instanceof Error', () => {
      const err = new ServiceError('test');
      expect(err).toBeInstanceOf(Error);
    });

    it('is instanceof ServiceError', () => {
      const err = new ServiceError('test');
      expect(err).toBeInstanceOf(ServiceError);
    });
  });

  describe('name property', () => {
    it('has correct name property', () => {
      const err = new ServiceError('test');
      expect(err.name).toBe('ServiceError');
    });
  });

  describe('static factory methods', () => {
    it('business() creates 400 error', () => {
      const err = ServiceError.business('bad input', { field: 'email' });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('BUSINESS_ERROR');
      expect(err.details).toEqual({ field: 'email' });
    });

    it('dataAccess() creates 500 error', () => {
      const original = new Error('db fail');
      const err = ServiceError.dataAccess('db error', original);
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('DATA_ACCESS_ERROR');
    });

    it('validation() creates 422 error', () => {
      const err = ServiceError.validation('invalid', ['required']);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('notFound() creates 404 error with resource and identifier', () => {
      const err = ServiceError.notFound('User', '123');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toContain('User');
      expect(err.message).toContain('123');
    });

    it('notFound() creates 404 error with resource only', () => {
      const err = ServiceError.notFound('Workspace');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('Workspace');
    });

    it('conflict() creates 409 error', () => {
      const err = ServiceError.conflict('version conflict');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });

    it('forbidden() creates 403 error', () => {
      const err = ServiceError.forbidden('delete user');
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
      expect(err.message).toContain('delete user');
    });
  });

  describe('resolveStatus()', () => {
    it('returns statusCode for ServiceError', () => {
      const err = ServiceError.validation('invalid');
      expect(ServiceError.resolveStatus(err)).toBe(422);
    });

    it('returns 500 for non-ServiceError', () => {
      expect(ServiceError.resolveStatus(new Error('unknown'))).toBe(500);
    });

    it('returns 500 for non-error values', () => {
      expect(ServiceError.resolveStatus('string')).toBe(500);
      expect(ServiceError.resolveStatus(null)).toBe(500);
    });
  });

  describe('toResponse()', () => {
    it('returns structured error response', () => {
      const err = ServiceError.business('bad', { hint: 'fix' });
      const resp = err.toResponse();
      expect(resp.success).toBe(false);
      expect(resp.error.code).toBe('BUSINESS_ERROR');
      expect(resp.error.message).toBe('bad');
      expect(resp.error.details).toEqual({ hint: 'fix' });
    });
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('fail'))).toBe('fail');
  });

  it('converts non-Error to string', () => {
    expect(getErrorMessage('raw string')).toBe('raw string');
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
  });
});

describe('getErrorStack', () => {
  it('extracts stack from Error instance', () => {
    const err = new Error('fail');
    expect(getErrorStack(err)).toBe(err.stack);
  });

  it('returns undefined for non-Error', () => {
    expect(getErrorStack('string')).toBeUndefined();
    expect(getErrorStack(null)).toBeUndefined();
  });
});
