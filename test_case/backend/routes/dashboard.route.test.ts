import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../server/services/DashboardService', () => ({
  dashboardService: {
    getStats: vi.fn(),
    getTodayExecution: vi.fn(),
    getTrendData: vi.fn(),
  },
}));

vi.mock('../../../server/services/DailySummaryScheduler', () => ({
  dailySummaryScheduler: {
    getStatus: vi.fn(),
  },
}));

vi.mock('../../../server/utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    errorLog: vi.fn(),
  },
}));

vi.mock('../../../server/config/logging', () => ({
  LOG_CONTEXTS: { DASHBOARD: 'DASHBOARD' },
  LOG_EVENTS: {
    DASHBOARD_ROUTE_ERROR: 'DASHBOARD_ROUTE_ERROR',
    DASHBOARD_DATA_INVALID: 'DASHBOARD_DATA_INVALID',
  },
}));

import { dashboardService } from '../../../server/services/DashboardService';
import dashboardRouter from '../../../server/routes/dashboard';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
  return app;
}

describe('GET /api/dashboard/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('success → 200 with stats data', async () => {
    const mockStats = {
      totalCases: 100,
      todayRuns: 10,
      todaySuccessRate: 85.5,
      runningTasks: 2,
    };
    vi.mocked(dashboardService.getStats).mockResolvedValue(mockStats);

    const res = await request(createApp()).get('/api/dashboard/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockStats);
    expect(dashboardService.getStats).toHaveBeenCalledOnce();
  });

  it('service error → 500', async () => {
    vi.mocked(dashboardService.getStats).mockRejectedValue(new Error('DB connection failed'));

    const res = await request(createApp()).get('/api/dashboard/stats');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('DB connection failed');
  });
});

describe('GET /api/dashboard/today-execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('success → 200 with validated data', async () => {
    const mockData = { total: 50, passed: 40, failed: 8, skipped: 2 };
    vi.mocked(dashboardService.getTodayExecution).mockResolvedValue(mockData);

    const res = await request(createApp()).get('/api/dashboard/today-execution');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockData);
  });

  it('invalid data (null) → 500', async () => {
    vi.mocked(dashboardService.getTodayExecution).mockResolvedValue(null as unknown as { total: number; passed: number; failed: number; skipped: number });

    const res = await request(createApp()).get('/api/dashboard/today-execution');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid data format received from service');
  });

  it('non-integer fields → defaults to 0', async () => {
    const mockData = { total: 3.5, passed: 'bad', failed: null, skipped: undefined };
    vi.mocked(dashboardService.getTodayExecution).mockResolvedValue(mockData as unknown as { total: number; passed: number; failed: number; skipped: number });

    const res = await request(createApp()).get('/api/dashboard/today-execution');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ total: 0, passed: 0, failed: 0, skipped: 0 });
  });
});

describe('GET /api/dashboard/trend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default days=30', async () => {
    vi.mocked(dashboardService.getTrendData).mockResolvedValue([]);

    await request(createApp()).get('/api/dashboard/trend');

    expect(dashboardService.getTrendData).toHaveBeenCalledWith(30);
  });

  it('custom days parameter', async () => {
    vi.mocked(dashboardService.getTrendData).mockResolvedValue([]);

    await request(createApp()).get('/api/dashboard/trend?days=7');

    expect(dashboardService.getTrendData).toHaveBeenCalledWith(7);
  });

  it('days < 1 → 400', async () => {
    const res = await request(createApp()).get('/api/dashboard/trend?days=-1');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Days parameter must be between 1 and 365');
  });

  it('days > 365 → 400', async () => {
    const res = await request(createApp()).get('/api/dashboard/trend?days=400');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Days parameter must be between 1 and 365');
  });

  it('service error → 500', async () => {
    vi.mocked(dashboardService.getTrendData).mockRejectedValue(new Error('Query timeout'));

    const res = await request(createApp()).get('/api/dashboard/trend');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Query timeout');
  });

  it('invalid data items → defaults to 0 values', async () => {
    const mockData = [
      null,
      { date: '2026-01-20', totalExecutions: 10, passedCases: 8, failedCases: 1, skippedCases: 1, successRate: 80 },
      { date: '2026-01-21', totalExecutions: 'bad', passedCases: null, failedCases: undefined, skippedCases: 3.5, successRate: 'nope' },
    ];
    vi.mocked(dashboardService.getTrendData).mockResolvedValue(mockData as unknown as { date: string; totalExecutions: number; passedCases: number; failedCases: number; skippedCases: number; successRate: number }[]);

    const res = await request(createApp()).get('/api/dashboard/trend');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([
      { date: '', totalExecutions: 0, passedCases: 0, failedCases: 0, skippedCases: 0, successRate: 0 },
      { date: '2026-01-20', totalExecutions: 10, passedCases: 8, failedCases: 1, skippedCases: 1, successRate: 80 },
      { date: '2026-01-21', totalExecutions: 0, passedCases: 0, failedCases: 0, skippedCases: 0, successRate: 0 },
    ]);
  });
});

describe('Cache-Control headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stats endpoint does not set explicit cache headers', async () => {
    vi.mocked(dashboardService.getStats).mockResolvedValue({});

    const res = await request(createApp()).get('/api/dashboard/stats');

    expect(res.headers['cache-control']).toBeUndefined();
    expect(res.headers['pragma']).toBeUndefined();
    expect(res.headers['surrogate-control']).toBeUndefined();
  });

  it('today-execution endpoint does not set explicit cache headers', async () => {
    vi.mocked(dashboardService.getTodayExecution).mockResolvedValue({ total: 1, passed: 1, failed: 0, skipped: 0 });

    const res = await request(createApp()).get('/api/dashboard/today-execution');

    expect(res.headers['cache-control']).toBeUndefined();
    expect(res.headers['pragma']).toBeUndefined();
    expect(res.headers['surrogate-control']).toBeUndefined();
  });

  it('trend endpoint does not set explicit cache headers', async () => {
    vi.mocked(dashboardService.getTrendData).mockResolvedValue([]);

    const res = await request(createApp()).get('/api/dashboard/trend');

    expect(res.headers['cache-control']).toBeUndefined();
    expect(res.headers['pragma']).toBeUndefined();
    expect(res.headers['surrogate-control']).toBeUndefined();
  });
});
