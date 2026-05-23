import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrunoAutomationRepository } from '../../../server/services/BrunoAutomation/repository';

const execute = vi.fn();

vi.mock('../../../server/config/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getPool: () => ({ execute }),
}));

describe('BrunoAutomationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue([{ insertId: 10 }]);
  });

  it('creates repository records using parameterized SQL', async () => {
    const repo = new BrunoAutomationRepository();

    const id = await repo.createRepository({
      name: 'Order API',
      projectId: 1,
      gitUrl: 'https://gitlab.example.com/qa/order-api.git',
      defaultBranch: 'main',
      collectionRoot: 'collections',
      authSecretRef: 'secret/gitlab/order-api',
    });

    expect(id).toBe(10);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO Auto_BrunoRepositories'),
      [
        'Order API',
        1,
        'https://gitlab.example.com/qa/order-api.git',
        'main',
        'collections',
        'secret/gitlab/order-api',
      ],
    );
  });
});
