import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import brunoRoutes from '../../../server/routes/bruno';

const { createRepository, listRepositories, getRepository, listCollections, syncRepository, runManual } = vi.hoisted(() => ({
  createRepository: vi.fn(),
  listRepositories: vi.fn(),
  getRepository: vi.fn(),
  listCollections: vi.fn(),
  syncRepository: vi.fn(),
  runManual: vi.fn(),
}));

vi.mock('../../../server/services/BrunoAutomation/repository', () => ({
  BrunoAutomationRepository: class {
    createRepository = createRepository;
    listRepositories = listRepositories;
    getRepository = getRepository;
    listCollections = listCollections;
  },
}));

vi.mock('../../../server/services/BrunoAutomation/sync', () => ({
  BrunoSyncService: class {
    syncRepository = syncRepository;
  },
}));

vi.mock('../../../server/services/BrunoAutomation/service', () => ({
  brunoAutomationService: {
    runManual,
  },
}));

vi.mock('../../../server/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: { id: number } }).user = { id: 7 };
    next();
  },
}));

vi.mock('../../../server/middleware/authRateLimiter', () => ({
  generalAuthRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

describe('bruno routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bruno', brunoRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a repository', async () => {
    createRepository.mockResolvedValue(9);

    const response = await request(app)
      .post('/api/bruno/repositories')
      .send({
        name: 'Order API',
        projectId: 1,
        gitUrl: 'https://gitlab.example.com/qa/order-api.git',
        defaultBranch: 'main',
        collectionRoot: 'collections',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { id: 9 },
    });
  });

  it('rejects invalid manual run config', async () => {
    const response = await request(app)
      .post('/api/bruno/runs')
      .send({
        projectId: 1,
        caseIds: [11],
        caseNameById: { '11': 'Create Order' },
        config: {
          repositoryId: 1,
          collectionPath: '../bad',
          targetType: 'collection',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('syncs a registered repository', async () => {
    getRepository.mockResolvedValue({
      id: 9,
      name: 'Order API',
      projectId: 1,
      gitUrl: 'https://gitlab.example.com/qa/order-api.git',
      defaultBranch: 'main',
      collectionRoot: 'collections',
      lastSyncCommit: null,
      lastSyncStatus: 'never',
      lastSyncError: null,
      createdAt: '2026-05-23',
      updatedAt: '2026-05-23',
    });
    syncRepository.mockResolvedValue({
      repositoryId: 9,
      commit: 'abc123',
      requestCount: 2,
    });

    const response = await request(app).post('/api/bruno/repositories/9/sync').send({});

    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({
      repositoryId: 9,
      commit: 'abc123',
      requestCount: 2,
    });
  });
});
