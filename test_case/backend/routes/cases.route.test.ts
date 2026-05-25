import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../server/config/dataSource', () => ({
  AppDataSource: {},
}));

vi.mock('../../../server/repositories/BaseRepository', () => ({
  BaseRepository: class {},
}));

const { mockFindAllWithUser, mockCount } = vi.hoisted(() => ({
  mockFindAllWithUser: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('../../../server/repositories/TestCaseRepository', () => ({
  TestCaseRepository: class {
    findAllWithUser = mockFindAllWithUser;
    count = mockCount;
  },
}));

vi.mock('../../../server/services/JenkinsService', () => ({
  jenkinsService: {},
  CaseType: {},
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
  LOG_CONTEXTS: { CASES: 'CASES' },
  createTimer: vi.fn(() => vi.fn(() => 100)),
}));

import casesRouter from '../../../server/routes/cases';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cases', casesRouter);
  return app;
}

const sampleRow = {
  id: 1,
  caseKey: 'TC-001',
  name: 'Test Case 1',
  description: 'desc',
  projectId: 10,
  repoId: 5,
  module: 'auth',
  owner: 'alice',
  source: 'manual',
  priority: 'P1',
  type: 'api',
  tags: 'smoke',
  config: { timeout: 30 },
  enabled: true,
  lastSyncCommit: 'abc123',
  createdBy: 1,
  createdByName: 'Alice',
  updatedBy: 2,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

describe('GET /api/cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns data with default pagination (limit=50, offset=0)', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 })
    );
  });

  it('respects custom limit and offset', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?limit=10&offset=20');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 })
    );
  });

  it('caps limit at 500', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?limit=999');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 })
    );
  });

  it('projectId NaN → 400', async () => {
    const res = await request(createApp()).get('/api/cases?projectId=abc');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('projectId');
    expect(mockFindAllWithUser).not.toHaveBeenCalled();
  });

  it('valid projectId → passes to repository', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?projectId=42');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 42 })
    );
  });

  it('passes module filter', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?module=auth');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'auth' })
    );
  });

  it('passes enabled filter (true string to boolean)', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?enabled=true');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );
  });

  it('passes enabled=false filter', async () => {
    mockFindAllWithUser.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const res = await request(createApp()).get('/api/cases?enabled=false');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it('passes type filter', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?type=api');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'api' })
    );
  });

  it('passes search filter', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?search=login');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'login' })
    );
  });

  it('passes priority filter', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?priority=P0');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'P0' })
    );
  });

  it('passes owner filter', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases?owner=alice');

    expect(res.status).toBe(200);
    expect(mockFindAllWithUser).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'alice' })
    );
  });

  it('empty data → returns empty array with message', async () => {
    mockFindAllWithUser.mockResolvedValue([]);

    const res = await request(createApp()).get('/api/cases');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.message).toContain('暂无测试用例数据');
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('database error → 500', async () => {
    mockFindAllWithUser.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(createApp()).get('/api/cases');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('DB connection failed');
  });

  it('maps result fields to snake_case', async () => {
    mockFindAllWithUser.mockResolvedValue([sampleRow]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases');

    const item = res.body.data[0];
    expect(item.case_key).toBe('TC-001');
    expect(item.project_id).toBe(10);
    expect(item.repo_id).toBe(5);
    expect(item.last_sync_commit).toBe('abc123');
    expect(item.created_by).toBe(1);
    expect(item.created_by_name).toBe('Alice');
    expect(item.updated_by).toBe(2);
    expect(item.created_at).toBe('2024-01-01T00:00:00Z');
    expect(item.updated_at).toBe('2024-01-02T00:00:00Z');
    expect(item.config_json).toBe('{"timeout":30}');
  });

  it('config_json is null when config is falsy', async () => {
    const rowWithoutConfig = { ...sampleRow, config: undefined };
    mockFindAllWithUser.mockResolvedValue([rowWithoutConfig]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases');

    expect(res.body.data[0].config_json).toBeNull();
  });

  it('created_by_name is null when missing', async () => {
    const rowNoName = { ...sampleRow, createdByName: undefined };
    mockFindAllWithUser.mockResolvedValue([rowNoName]);
    mockCount.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/cases');

    expect(res.body.data[0].created_by_name).toBeNull();
  });
});
