import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQueryBuilder, mockQueryRunner, mockRepository, mockDataSource } = vi.hoisted(() => {
  const mockQueryBuilder = {
    andWhere: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
    getMany: vi.fn(),
    getRawMany: vi.fn(),
    getCount: vi.fn(),
  };

  const mockQueryRunner = {
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    manager: {
      create: vi.fn(),
      save: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const mockRepository = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockDataSource = {
    getRepository: vi.fn().mockReturnValue(mockRepository),
    createQueryRunner: vi.fn().mockReturnValue(mockQueryRunner),
  };

  return { mockQueryBuilder, mockQueryRunner, mockRepository, mockDataSource };
});

vi.mock('../../../server/utils/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    errorLog: vi.fn(),
    performanceLog: vi.fn(),
  },
}));

vi.mock('../../../server/config/logging', () => ({
  createTimer: vi.fn().mockReturnValue(() => 0),
}));

import { TestCaseRepository } from '../../../server/repositories/TestCaseRepository';

describe('TestCaseRepository', () => {
  let repo: TestCaseRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockDataSource.getRepository.mockReturnValue(mockRepository);
    repo = new TestCaseRepository(mockDataSource as never);
  });

  describe('findById', () => {
    it('returns case when found', async () => {
      const testCase = { id: 1, name: 'test' };
      mockRepository.findOne.mockResolvedValue(testCase);

      const result = await repo.findById(1);

      expect(result).toEqual(testCase);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('returns case when found', async () => {
      const testCase = { id: 1, name: 'my-test' };
      mockRepository.findOne.mockResolvedValue(testCase);

      const result = await repo.findByName('my-test');

      expect(result).toEqual(testCase);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { name: 'my-test' } });
    });
  });

  describe('findByScriptPath', () => {
    it('returns case when found', async () => {
      const testCase = { id: 1, scriptPath: 'test_case/file.py' };
      mockRepository.findOne.mockResolvedValue(testCase);

      const result = await repo.findByScriptPath('test_case/file.py');

      expect(result).toEqual(testCase);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { scriptPath: 'test_case/file.py' } });
    });
  });

  describe('findAll', () => {
    it('applies type filter', async () => {
      const cases = [{ id: 1 }, { id: 2 }];
      mockQueryBuilder.getMany.mockResolvedValue(cases);

      const result = await repo.findAll({ type: 'api' });

      expect(result).toEqual(cases);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('testCase.type = :type', { type: 'api' });
    });

    it('applies priority filter', async () => {
      const cases = [{ id: 1 }];
      mockQueryBuilder.getMany.mockResolvedValue(cases);

      const result = await repo.findAll({ priority: 'P0' });

      expect(result).toEqual(cases);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('testCase.priority = :priority', { priority: 'P0' });
    });

    it('applies limit and offset', async () => {
      const cases = [{ id: 1 }];
      mockQueryBuilder.getMany.mockResolvedValue(cases);

      const result = await repo.findAll({ limit: 10, offset: 5 });

      expect(result).toEqual(cases);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(5);
    });
  });

  describe('createTestCase', () => {
    it('parses valid JSON config', async () => {
      const configJson = '{"timeout": 30, "retries": 3}';
      const savedCase = { id: 1, name: 'test', config: { timeout: 30, retries: 3 } };
      mockRepository.create.mockReturnValue(savedCase);
      mockRepository.save.mockResolvedValue(savedCase);

      const result = await repo.createTestCase({
        name: 'test',
        configJson,
      });

      expect(result).toEqual(savedCase);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { timeout: 30, retries: 3 },
        })
      );
    });

    it('throws on invalid JSON config', async () => {
      await expect(
        repo.createTestCase({
          name: 'test',
          configJson: 'not-json',
        })
      ).rejects.toThrow('Invalid JSON configuration');
    });

    it('parses comma-separated tags', async () => {
      const savedCase = { id: 1, name: 'test', tags: ['smoke', 'regression'] };
      mockRepository.create.mockReturnValue(savedCase);
      mockRepository.save.mockResolvedValue(savedCase);

      const result = await repo.createTestCase({
        name: 'test',
        tags: 'smoke, regression',
      });

      expect(result).toEqual(savedCase);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['smoke', 'regression'],
        })
      );
    });

    it('uses defaults for priority and type', async () => {
      const savedCase = { id: 1, name: 'test' };
      mockRepository.create.mockReturnValue(savedCase);
      mockRepository.save.mockResolvedValue(savedCase);

      await repo.createTestCase({ name: 'test' });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'P1',
          type: 'api',
        })
      );
    });
  });

  describe('updateTestCaseSafe', () => {
    it('updates basic fields', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repo.updateTestCaseSafe(1, {
        name: 'updated-name',
        description: 'new desc',
        priority: 'P0',
      });

      expect(mockRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          name: 'updated-name',
          description: 'new desc',
          priority: 'P0',
        })
      );
    });

    it('throws on invalid JSON config', async () => {
      await expect(
        repo.updateTestCaseSafe(1, { configJson: '{bad json}' })
      ).rejects.toThrow('Invalid JSON configuration');
    });

    it('parses tags string', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repo.updateTestCaseSafe(1, { tags: 'a,b,c' });

      expect(mockRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          tags: ['a', 'b', 'c'],
        })
      );
    });
  });

  describe('deleteTestCase', () => {
    it('calls delete with correct id', async () => {
      mockRepository.delete.mockResolvedValue(undefined);

      await repo.deleteTestCase(42);

      expect(mockRepository.delete).toHaveBeenCalledWith(42);
    });
  });

  describe('count', () => {
    it('handles single priority value', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(5);

      const result = await repo.count({ priority: 'P0' });

      expect(result).toBe(5);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'testCase.priority = :priority',
        { priority: 'P0' }
      );
    });

    it('handles comma-separated priority values', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(10);

      const result = await repo.count({ priority: 'P0,P1' });

      expect(result).toBe(10);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'testCase.priority IN (:...priorities)',
        { priorities: ['P0', 'P1'] }
      );
    });

    it('handles search filter', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(3);

      const result = await repo.count({ search: 'login' });

      expect(result).toBe(3);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(testCase.name LIKE :search OR testCase.description LIKE :search)',
        { search: '%login%' }
      );
    });
  });

  describe('getDistinctOwners', () => {
    it('returns unique owners', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { owner: 'alice' },
        { owner: 'bob' },
      ]);

      const result = await repo.getDistinctOwners();

      expect(result).toEqual(['alice', 'bob']);
      expect(mockQueryBuilder.select).toHaveBeenCalledWith('DISTINCT testCase.owner', 'owner');
    });
  });

  describe('getDistinctModules', () => {
    it('returns unique modules', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { module: 'auth' },
        { module: 'billing' },
      ]);

      const result = await repo.getDistinctModules();

      expect(result).toEqual(['auth', 'billing']);
      expect(mockQueryBuilder.select).toHaveBeenCalledWith('DISTINCT testCase.module', 'module');
    });
  });

  describe('createTestCasesBatch', () => {
    it('creates multiple cases in transaction', async () => {
      const testCases = [
        { name: 'case1' },
        { name: 'case2' },
      ];
      const created1 = { id: 1, name: 'case1' };
      const created2 = { id: 2, name: 'case2' };

      mockQueryRunner.manager.create.mockReturnValueOnce(created1).mockReturnValueOnce(created2);
      mockQueryRunner.manager.save.mockResolvedValueOnce(created1).mockResolvedValueOnce(created2);

      const result = await repo.createTestCasesBatch(testCases);

      expect(result).toEqual([created1, created2]);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('rolls back on error', async () => {
      const testCases = [{ name: 'case1' }];
      mockQueryRunner.manager.create.mockReturnValue({});
      mockQueryRunner.manager.save.mockRejectedValue(new Error('db error'));

      await expect(repo.createTestCasesBatch(testCases)).rejects.toThrow('db error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('deleteTestCasesBatch', () => {
    it('validates existence before delete', async () => {
      const case1 = { id: 1 };
      const case2 = { id: 2 };
      mockQueryRunner.manager.findOne.mockResolvedValueOnce(case1).mockResolvedValueOnce(case2);
      mockQueryRunner.manager.delete.mockResolvedValue(undefined);

      await repo.deleteTestCasesBatch([1, 2]);

      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.manager.delete).toHaveBeenCalledWith(expect.any(Function), [1, 2]);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('throws if case not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

      await expect(repo.deleteTestCasesBatch([1, 999])).rejects.toThrow('Test case with ID 999 not found');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
