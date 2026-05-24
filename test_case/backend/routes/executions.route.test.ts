import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../server/services/ExecutionService', () => ({
  executionService: {
    handleCallback: vi.fn(),
    markExecutionRunning: vi.fn(),
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
  LOG_CONTEXTS: { EXECUTION: 'EXECUTION' },
  createTimer: vi.fn(() => vi.fn(() => 100)),
}));

vi.mock('../../../server/config/database', () => ({
  query: vi.fn(),
}));

vi.mock('../../../server/middleware/auth', () => ({
  authenticate: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  requireTester: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
}));

import { executionService } from '../../../server/services/ExecutionService';
import executionsRouter from '../../../server/routes/executions';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/executions', executionsRouter);
  return app;
}

describe('POST /api/executions/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing executionId → 400', async () => {
    const res = await request(createApp())
      .post('/api/executions/callback')
      .send({ status: 'success', results: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('executionId, status, and results are required');
  });

  it('missing status → 400', async () => {
    const res = await request(createApp())
      .post('/api/executions/callback')
      .send({ executionId: 'exec-1', results: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('executionId, status, and results are required');
  });

  it('results not array → 400', async () => {
    const res = await request(createApp())
      .post('/api/executions/callback')
      .send({ executionId: 'exec-1', status: 'success', results: 'not-array' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('executionId, status, and results are required');
  });

  it('success → 200', async () => {
    vi.mocked(executionService.handleCallback).mockResolvedValue(undefined);
    const res = await request(createApp())
      .post('/api/executions/callback')
      .send({
        executionId: 'exec-1',
        status: 'success',
        results: [{ name: 'test1', status: 'passed' }],
        duration: 1200,
        reportUrl: 'http://example.com/report',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(executionService.handleCallback).toHaveBeenCalledWith({
      executionId: 'exec-1',
      status: 'success',
      results: [{ name: 'test1', status: 'passed' }],
      duration: 1200,
      reportUrl: 'http://example.com/report',
    });
  });

  it('service error → 500', async () => {
    vi.mocked(executionService.handleCallback).mockRejectedValue(new Error('Database connection failed'));
    const res = await request(createApp())
      .post('/api/executions/callback')
      .send({
        executionId: 'exec-1',
        status: 'success',
        results: [{ name: 'test1', status: 'passed' }],
      });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Database connection failed');
  });
});

describe('POST /api/executions/:id/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalid id (NaN) → 500', async () => {
    vi.mocked(executionService.markExecutionRunning).mockRejectedValue(new Error('Invalid execution ID'));
    const res = await request(createApp())
      .post('/api/executions/abc/start');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('success → 200', async () => {
    vi.mocked(executionService.markExecutionRunning).mockResolvedValue(undefined);
    const res = await request(createApp())
      .post('/api/executions/42/start');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(executionService.markExecutionRunning).toHaveBeenCalledWith(42);
  });

  it('not found → 500 (no 404 handling in route)', async () => {
    vi.mocked(executionService.markExecutionRunning).mockRejectedValue(new Error('Execution not found'));
    const res = await request(createApp())
      .post('/api/executions/999/start');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Execution not found');
  });

  it('service error → 500', async () => {
    vi.mocked(executionService.markExecutionRunning).mockRejectedValue(new Error('Internal server error'));
    const res = await request(createApp())
      .post('/api/executions/1/start');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Internal server error');
  });
});
