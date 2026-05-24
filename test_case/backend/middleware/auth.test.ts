import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockVerifyToken, mockLoggerWarn, mockLoggerDebug, mockSetContext } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
  mockSetContext: vi.fn(),
}));

vi.mock('../../../server/services/AuthService', () => ({
  authService: { verifyToken: mockVerifyToken },
}));

vi.mock('../../../server/utils/logger', () => ({
  default: {
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    info: vi.fn(),
    error: vi.fn(),
  },
  Logger: { setContext: mockSetContext },
}));

vi.mock('../../../server/config/logging', () => ({
  LOG_CONTEXTS: { AUTH: 'AUTH' },
}));

import {
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireTester,
} from '../../../server/middleware/auth';

const createMockReq = (overrides: Record<string, unknown> = {}) => ({
  headers: {},
  path: '/test',
  method: 'GET',
  connection: { remoteAddress: '127.0.0.1' },
  ...overrides,
});

const createMockRes = () => {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
};

const createMockNext = () => vi.fn();

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should return 401 when Authorization header is missing', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      authenticate(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: '未提供认证令牌' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when verifyToken returns null', () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ headers: { authorization: 'Bearer invalid-token' } });
      const res = createMockRes();
      const next = createMockNext();

      authenticate(req as never, res as never, next);

      expect(mockVerifyToken).toHaveBeenCalledWith('invalid-token');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: '无效或过期的令牌' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should set req.user and call next when token is valid', () => {
      const user = { id: 1, email: 'test@example.com', role: 'admin' };
      mockVerifyToken.mockReturnValue(user);
      const req = createMockReq({ headers: { authorization: 'Bearer valid-token' } });
      const res = createMockRes();
      const next = createMockNext();

      authenticate(req as never, res as never, next);

      expect(req.user).toEqual(user);
      expect(mockSetContext).toHaveBeenCalledWith({ userId: '1' });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should extract token without Bearer prefix', () => {
      const user = { id: 2, email: 'user@example.com', role: 'tester' };
      mockVerifyToken.mockReturnValue(user);
      const req = createMockReq({ headers: { authorization: 'raw-token' } });
      const res = createMockRes();
      const next = createMockNext();

      authenticate(req as never, res as never, next);

      expect(mockVerifyToken).toHaveBeenCalledWith('raw-token');
      expect(req.user).toEqual(user);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should call next without setting user when no Authorization header', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      optionalAuth(req as never, res as never, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should set req.user when valid token is provided', () => {
      const user = { id: 3, email: 'opt@example.com', role: 'developer' };
      mockVerifyToken.mockReturnValue(user);
      const req = createMockReq({ headers: { authorization: 'Bearer valid-token' } });
      const res = createMockRes();
      const next = createMockNext();

      optionalAuth(req as never, res as never, next);

      expect(req.user).toEqual(user);
      expect(mockSetContext).toHaveBeenCalledWith({ userId: '3' });
      expect(next).toHaveBeenCalled();
    });

    it('should call next without user when token is invalid', () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ headers: { authorization: 'Bearer bad-token' } });
      const res = createMockRes();
      const next = createMockNext();

      optionalAuth(req as never, res as never, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should return 401 when req.user is not set', () => {
      const middleware = requireRole('admin');
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      middleware(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: '未认证' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user role does not match', () => {
      const middleware = requireRole('admin');
      const req = createMockReq({ user: { id: 1, email: 'user@test.com', role: 'viewer' } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: '没有权限执行此操作' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next when user role matches', () => {
      const middleware = requireRole('admin');
      const req = createMockReq({ user: { id: 1, email: 'admin@test.com', role: 'admin' } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req as never, res as never, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next when user role matches one of multiple allowed roles', () => {
      const middleware = requireRole('admin', 'tester', 'developer');
      const req = createMockReq({ user: { id: 2, email: 'tester@test.com', role: 'tester' } });
      const res = createMockRes();
      const next = createMockNext();

      middleware(req as never, res as never, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should behave as requireRole("admin")', () => {
      const req = createMockReq({ user: { id: 1, email: 'admin@test.com', role: 'admin' } });
      const res = createMockRes();
      const next = createMockNext();

      requireAdmin(req as never, res as never, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject non-admin users', () => {
      const req = createMockReq({ user: { id: 1, email: 'user@test.com', role: 'tester' } });
      const res = createMockRes();
      const next = createMockNext();

      requireAdmin(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireTester', () => {
    it('should accept admin role', () => {
      const req = createMockReq({ user: { id: 1, email: 'admin@test.com', role: 'admin' } });
      const res = createMockRes();
      const next = createMockNext();

      requireTester(req as never, res as never, next);

      expect(next).toHaveBeenCalled();
    });

    it('should accept tester role', () => {
      const req = createMockReq({ user: { id: 2, email: 'tester@test.com', role: 'tester' } });
      const res = createMockRes();
      const next = createMockNext();

      requireTester(req as never, res as never, next);

      expect(next).toHaveBeenCalled();
    });

    it('should accept developer role', () => {
      const req = createMockReq({ user: { id: 3, email: 'dev@test.com', role: 'developer' } });
      const res = createMockRes();
      const next = createMockNext();

      requireTester(req as never, res as never, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject other roles', () => {
      const req = createMockReq({ user: { id: 4, email: 'viewer@test.com', role: 'viewer' } });
      const res = createMockRes();
      const next = createMockNext();

      requireTester(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
