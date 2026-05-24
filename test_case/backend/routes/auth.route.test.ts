import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../server/services/AuthService', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getCurrentUser: vi.fn(),
    refreshToken: vi.fn(),
    getLoginPublicKey: vi.fn(),
    decryptLoginPassword: vi.fn(),
  },
}));

vi.mock('../../../server/middleware/auth', () => ({
  authenticate: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
}));

vi.mock('../../../server/middleware/authRateLimiter', () => ({
  loginRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  registerRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  forgotPasswordRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  resetPasswordRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  refreshRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  generalAuthRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../../server/utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    errorLog: vi.fn(),
  },
  Logger: vi.fn(),
}));

vi.mock('../../../server/config/logging', () => ({
  LOG_CONTEXTS: { AUTH: 'AUTH' },
  LOG_EVENTS: {},
}));

import { authService } from '../../../server/services/AuthService';
import { authenticate } from '../../../server/middleware/auth';
import authRouter from '../../../server/routes/auth';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing fields → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('invalid email → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: '123456', username: 'testuser' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('邮箱格式不正确');
  });

  it('password too short (< 6) → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '12345', username: 'testuser' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('密码长度至少为 6 位');
  });

  it('username too short (< 2) → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '123456', username: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('用户名长度应在 2-50 个字符之间');
  });

  it('email too long (> 254) → 400', async () => {
    const longEmail = 'a'.repeat(250) + '@b.com';
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: longEmail, password: '123456', username: 'testuser' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('邮箱格式不正确');
  });

  it('success → 201', async () => {
    vi.mocked(authService.register).mockResolvedValue({ success: true, message: '注册成功' });
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '123456', username: 'testuser' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(authService.register).toHaveBeenCalledWith('test@example.com', '123456', 'testuser');
  });

  it('service returns failure → 400', async () => {
    vi.mocked(authService.register).mockResolvedValue({ success: false, message: '邮箱已存在' });
    const res = await request(createApp())
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '123456', username: 'testuser' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('邮箱已存在');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing email/password → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('请提供邮箱和密码');
  });

  it('success → 200 with token', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      success: true,
      token: 'jwt-token',
      user: { id: 1, email: 'test@example.com', username: 'testuser', role: 'user' },
    });
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('jwt-token');
  });

  it('service returns failure → 401', async () => {
    vi.mocked(authService.login).mockResolvedValue({ success: false, message: '邮箱或密码错误' });
    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockImplementation((_req, _res, next) => next());
  });

  it('no user (auth middleware doesn\'t set user) → 401', async () => {
    vi.mocked(authenticate).mockImplementation((req, _res, next) => {
      next();
    });
    const res = await request(createApp())
      .post('/api/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('未认证');
  });

  it('success → 200', async () => {
    vi.mocked(authenticate).mockImplementation((req, _res, next) => {
      (req as any).user = { id: 1, email: 'test@example.com', role: 'user' };
      next();
    });
    vi.mocked(authService.logout).mockResolvedValue({ success: true, message: '已登出' });
    const res = await request(createApp())
      .post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authService.logout).toHaveBeenCalledWith(1);
  });
});

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing email → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/forgot-password')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('请提供邮箱地址');
  });

  it('success → 200', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue({ success: true, message: '重置邮件已发送' });
    const res = await request(createApp())
      .post('/api/auth/forgot-password')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing token/password → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('请提供重置令牌和新密码');
  });

  it('password too short → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: 'abc', password: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('密码长度至少为 6 位');
  });

  it('success → 200', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue({ success: true, message: '密码已重置' });
    const res = await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: 'valid-token', password: 'newpassword' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authService.resetPassword).toHaveBeenCalledWith('valid-token', 'newpassword');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no user → 401', async () => {
    vi.mocked(authenticate).mockImplementation((req, _res, next) => {
      next();
    });
    const res = await request(createApp())
      .get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('未认证');
  });

  it('user not found → 404', async () => {
    vi.mocked(authenticate).mockImplementation((req, _res, next) => {
      (req as any).user = { id: 999, email: 'test@example.com', role: 'user' };
      next();
    });
    vi.mocked(authService.getCurrentUser).mockResolvedValue(null);
    const res = await request(createApp())
      .get('/api/auth/me');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('用户不存在');
  });

  it('success → 200', async () => {
    vi.mocked(authenticate).mockImplementation((req, _res, next) => {
      (req as any).user = { id: 1, email: 'test@example.com', role: 'user' };
      next();
    });
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      role: 'user',
    });
    const res = await request(createApp())
      .get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('test@example.com');
  });
});

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing refreshToken → 400', async () => {
    const res = await request(createApp())
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('请提供刷新令牌');
  });

  it('success → 200', async () => {
    vi.mocked(authService.refreshToken).mockResolvedValue({ token: 'new-jwt-token' });
    const res = await request(createApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('new-jwt-token');
  });

  it('invalid token → 401', async () => {
    vi.mocked(authService.refreshToken).mockResolvedValue({ token: null, message: '无效的刷新令牌' });
    const res = await request(createApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('无效的刷新令牌');
  });
});

describe('GET /api/auth/public-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('success → 200', async () => {
    vi.mocked(authService.getLoginPublicKey).mockReturnValue({
      publicKey: 'mock-public-key',
      keyId: 'key-1',
    });
    const res = await request(createApp())
      .get('/api/auth/public-key');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.publicKey).toBe('mock-public-key');
    expect(res.body.keyId).toBe('key-1');
  });
});
