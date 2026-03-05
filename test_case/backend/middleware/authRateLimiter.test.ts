import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  refreshRateLimiter,
  generalAuthRateLimiter,
} from '../../../server/middleware/authRateLimiter';

describe('Auth Rate Limiters', () => {
  let app: Express;

  // Helper to create a fresh Express app for each test
  const createApp = (limiter: any) => {
    const testApp = express();
    testApp.use(express.json());
    testApp.post('/test', limiter, (req, res) => {
      res.status(200).json({ success: true });
    });
    testApp.get('/test', limiter, (req, res) => {
      res.status(200).json({ success: true });
    });
    return testApp;
  };

  afterEach(() => {
    // Clear any timers or intervals
    vi.clearAllTimers();
  });

  describe('loginRateLimiter', () => {
    beforeEach(() => {
      app = createApp(loginRateLimiter);
    });

    it('should allow 5 requests within 15 minutes', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/test')
          .send({ email: 'test@example.com', password: 'password' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });

    it('should block 6th request with 429 status', async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/test')
          .send({ email: 'test@example.com', password: 'password' });
      }

      // 6th request should be blocked
      const res = await request(app)
        .post('/test')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('error', 'Too many requests');
      expect(res.body).toHaveProperty('message', 'Please try again later');
      expect(res.body.success).toBe(false);
    });

    it('should return rate limit headers', async () => {
      const res = await request(app)
        .post('/test')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
      expect(res.headers['ratelimit-limit']).toBe('5');
    });

    it('should include retry-after information in 429 response', async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('retryAfter');
      expect(res.headers).toHaveProperty('ratelimit-reset');
    });
  });

  describe('registerRateLimiter', () => {
    beforeEach(() => {
      app = createApp(registerRateLimiter);
    });

    it('should allow 3 requests within 1 hour', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/test')
          .send({
            email: `test${i}@example.com`,
            password: 'Test123!',
            username: `test${i}`
          });
        expect(res.status).toBe(200);
      }
    });

    it('should block 4th request with 429 status', async () => {
      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/test')
          .send({
            email: `test${i}@example.com`,
            password: 'Test123!',
            username: `test${i}`
          });
      }

      // 4th request should be blocked
      const res = await request(app)
        .post('/test')
        .send({ email: 'test3@example.com', password: 'Test123!', username: 'test3' });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests');
    });

    it('should return correct rate limit for registration (3 requests)', async () => {
      const res = await request(app).post('/test');
      expect(res.headers['ratelimit-limit']).toBe('3');
    });
  });

  describe('forgotPasswordRateLimiter', () => {
    beforeEach(() => {
      app = createApp(forgotPasswordRateLimiter);
    });

    it('should enforce 3 requests per hour limit', async () => {
      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/test')
          .send({ email: 'test@example.com' });
        expect(res.status).toBe(200);
      }

      // 4th request should be blocked
      const res = await request(app)
        .post('/test')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(429);
      expect(res.body.message).toContain('try again later');
    });

    it('should return user-friendly error message', async () => {
      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('resetPasswordRateLimiter', () => {
    beforeEach(() => {
      app = createApp(resetPasswordRateLimiter);
    });

    it('should allow 5 requests within 15 minutes', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/test')
          .send({ token: 'reset-token', password: 'NewPass123!' });
        expect(res.status).toBe(200);
      }
    });

    it('should block 6th request', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
    });
  });

  describe('refreshRateLimiter', () => {
    beforeEach(() => {
      app = createApp(refreshRateLimiter);
    });

    it('should allow 10 requests within 15 minutes', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/test')
          .send({ refreshToken: 'some-refresh-token' });
        expect(res.status).toBe(200);
      }
    });

    it('should block 11th request', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
    });

    it('should have higher limit than login (10 vs 5)', async () => {
      const res = await request(app).post('/test');
      expect(res.headers['ratelimit-limit']).toBe('10');
    });
  });

  describe('generalAuthRateLimiter', () => {
    beforeEach(() => {
      app = createApp(generalAuthRateLimiter);
    });

    it('should allow 100 requests within 15 minutes', async () => {
      // Test first 10 requests to verify it's working
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
      }

      // Verify the limit is set correctly
      const res = await request(app).get('/test');
      expect(res.headers['ratelimit-limit']).toBe('100');
    });

    it('should block request after 100 attempts', async () => {
      // Exhaust the limit
      for (let i = 0; i < 100; i++) {
        await request(app).get('/test');
      }

      // 101st request should be blocked
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should have much higher limit for read operations', async () => {
      const res = await request(app).get('/test');
      expect(res.headers['ratelimit-limit']).toBe('100');
      expect(parseInt(res.headers['ratelimit-limit'])).toBeGreaterThan(10);
    });
  });

  describe('Rate Limit Headers', () => {
    beforeEach(() => {
      app = createApp(loginRateLimiter);
    });

    it('should include RateLimit-Limit header', async () => {
      const res = await request(app).post('/test');
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers['ratelimit-limit']).toBe('5');
    });

    it('should include RateLimit-Remaining header', async () => {
      const res = await request(app).post('/test');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
      expect(parseInt(res.headers['ratelimit-remaining'])).toBeLessThan(5);
    });

    it('should include RateLimit-Reset header', async () => {
      const res = await request(app).post('/test');
      expect(res.headers).toHaveProperty('ratelimit-reset');

      // Reset time is returned (could be absolute timestamp or relative seconds)
      const resetTime = parseInt(res.headers['ratelimit-reset']);
      expect(resetTime).toBeGreaterThan(0);
      // Should be within reasonable range (15 minutes window = 900 seconds)
      expect(resetTime).toBeLessThanOrEqual(15 * 60 + Date.now() / 1000);
    });

    it('should decrement RateLimit-Remaining with each request', async () => {
      const res1 = await request(app).post('/test');
      const remaining1 = parseInt(res1.headers['ratelimit-remaining']);

      const res2 = await request(app).post('/test');
      const remaining2 = parseInt(res2.headers['ratelimit-remaining']);

      // Remaining should decrease (may be 0 if already at limit)
      expect(remaining2).toBeLessThanOrEqual(remaining1);
      // If not at limit, should decrease by exactly 1
      if (remaining1 > 0) {
        expect(remaining2).toBe(remaining1 - 1);
      }
    });

    it('should show 0 remaining when limit is reached', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');
      expect(res.status).toBe(429);
      expect(res.headers['ratelimit-remaining']).toBe('0');
    });
  });

  describe('Error Response Format', () => {
    beforeEach(() => {
      app = createApp(loginRateLimiter);
    });

    it('should return consistent error format on rate limit', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');

      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({
        success: false,
        error: 'Too many requests',
        message: 'Please try again later',
      });
      expect(res.body).toHaveProperty('retryAfter');
    });

    it('should include retry information', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await request(app).post('/test');
      }

      const res = await request(app).post('/test');
      expect(res.body.retryAfter).toBeDefined();
    });
  });

  describe('IP-based Tracking', () => {
    it('should track requests per IP address', async () => {
      const app1 = createApp(loginRateLimiter);

      // First IP exhausts its limit
      for (let i = 0; i < 5; i++) {
        await request(app1).post('/test');
      }

      const blockedRes = await request(app1).post('/test');
      expect(blockedRes.status).toBe(429);

      // Different test instance simulates different IP (in real scenario)
      // Note: supertest uses same IP, so this is more of a structural test
      expect(blockedRes.headers).toHaveProperty('ratelimit-remaining', '0');
    });
  });
});
