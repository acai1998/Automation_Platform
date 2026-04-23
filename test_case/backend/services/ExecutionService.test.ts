import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionService } from '../../../server/services/ExecutionService';
import { jenkinsStatusService } from '../../../server/services/JenkinsStatusService';
import logger from '../../../server/utils/logger';

// Hoist mock instance
const { mockRepoInstance } = vi.hoisted(() => {
  return {
    mockRepoInstance: {
      // 基础 CRUD 方法
      getExecutionsWithJenkinsInfo: vi.fn(),
      getTestRunStatus: vi.fn(),
      markExecutionRunning: vi.fn(),
      runInTransaction: vi.fn(),
      createTestResults: vi.fn(),
      createTestResult: vi.fn().mockResolvedValue({}),
      updateExecutionResults: vi.fn(),
      updateTestResult: vi.fn().mockResolvedValue({}),
      getExecutionDetail: vi.fn(),
      getRecentExecutions: vi.fn(),
      cancelExecution: vi.fn(),
      triggerExecution: vi.fn(),
      getTestRunDetail: vi.fn(),
      getTestRunDetailRow: vi.fn(),
      getExecutionResults: vi.fn(),
      getResultsByRunId: vi.fn(),
      updateJenkinsInfo: vi.fn(),
      completeBatch: vi.fn(),
      findExecutionIdByRunId: vi.fn(),
      findExecutionId: vi.fn(),
      getTestRunBasicInfo: vi.fn(),
      getAllTestRuns: vi.fn(),
      getRunCases: vi.fn(),
      updateTestRunStatus: vi.fn(),
      updateTestRunResults: vi.fn().mockResolvedValue({}),
      getPotentiallyTimedOutExecutions: vi.fn(),
      markExecutionAsTimedOut: vi.fn(),
      bulkUpdateErrorResults: vi.fn().mockResolvedValue(0),
      countResultsByStatus: vi.fn().mockResolvedValue({ passed: 0, failed: 0, skipped: 0 }),
      createTaskExecution: vi.fn(),
      createTestRun: vi.fn(),
      getActiveCases: vi.fn(),
      getPotentiallyStuckExecutions: vi.fn(),
      markOldStuckExecutionsAsAbandoned: vi.fn(),
      syncTestRunByExecutionId: vi.fn(),
    }
  };
});

// Mock dependencies
// JenkinsStatusService 使用 require('../utils/secrets')，需要提供完整 mock 防止模块加载失败
vi.mock('../../../server/services/JenkinsStatusService', () => ({
  JenkinsStatusService: vi.fn().mockImplementation(() => ({
    getBuildStatus: vi.fn(),
    parseBuildResults: vi.fn(),
  })),
  jenkinsStatusService: {
    getBuildStatus: vi.fn(),
    parseBuildResults: vi.fn(),
  },
  TestResults: {},
}));
vi.mock('../../../server/repositories/ExecutionRepository', () => {
  return {
    ExecutionRepository: class {
      constructor() {
        return mockRepoInstance;
      }
    }
  };
});
vi.mock('../../../server/services/DashboardService', () => ({
  dashboardService: {
    refreshDailySummary: vi.fn(),
  },
}));
vi.mock('../../../server/config/database', () => ({
  AppDataSource: {},
}));
vi.mock('../../../server/utils/logger', () => {
  return {
    LogLevel: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    },
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      errorLog: vi.fn(),
    },
  };
});

describe('ExecutionService', () => {
  let service: ExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    // 使用 mockClear 清除调用记录（不清除 mockReturnValue/mockResolvedValue 实现）
    // 使用 mockReset 会清除所有实现，导致依赖默认返回值的测试失败
    Object.values(mockRepoInstance).forEach((mock: any) => {
      if (mock.mockClear) mock.mockClear();
    });

    // 重新设置需要默认返回值的方法
    mockRepoInstance.bulkUpdateErrorResults.mockResolvedValue(0);
    mockRepoInstance.countResultsByStatus.mockResolvedValue({ passed: 0, failed: 0, skipped: 0 });
    mockRepoInstance.updateTestResult.mockResolvedValue({});
    mockRepoInstance.createTestResult.mockResolvedValue({});
    mockRepoInstance.updateTestRunResults.mockResolvedValue({});

    service = new ExecutionService();
  });

  describe('triggerTestExecution', () => {
    it('should throw error when caseIds is empty', async () => {
      await expect(service.triggerTestExecution({
        caseIds: [],
        projectId: 1,
        triggeredBy: 1,
        triggerType: 'manual',
      })).rejects.toThrow('Case IDs cannot be empty');
    });

    it('should create execution and cache mapping', async () => {
      const mockResult = {
        runId: 123,
        executionId: 456,
        totalCases: 3,
        caseIds: [1, 2, 3],
      };

      mockRepoInstance.triggerExecution.mockResolvedValue(mockResult);

      const result = await service.triggerTestExecution({
        caseIds: [1, 2, 3],
        projectId: 1,
        triggeredBy: 1,
        triggerType: 'manual',
      });

      expect(result).toEqual(mockResult);
      expect(mockRepoInstance.triggerExecution).toHaveBeenCalledWith({
        caseIds: [1, 2, 3],
        projectId: 1,
        triggeredBy: 1,
        triggerType: 'manual',
        jenkinsJob: undefined,
        runConfig: undefined,
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockRepoInstance.triggerExecution.mockRejectedValue(new Error('Database error'));

      await expect(service.triggerTestExecution({
        caseIds: [1, 2, 3],
        projectId: 1,
        triggeredBy: 1,
        triggerType: 'manual',
      })).rejects.toThrow('Database error');

      expect(logger.errorLog).toHaveBeenCalled();
    });
  });

  describe('completeBatchExecution', () => {
    it('should reconcile duplicate completion when callback still carries summary data', async () => {
      const mockExecution = {
        id: 123,
        status: 'success', // Already completed
        startTime: new Date(),
      };

      mockRepoInstance.getTestRunDetail.mockResolvedValue(mockExecution);

      await service.completeBatchExecution(123, {
        status: 'success',
        passedCases: 5,
        failedCases: 0,
        skippedCases: 0,
        durationMs: 1000,
      });

      expect(mockRepoInstance.completeBatch).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          status: 'success',
          passedCases: 5,
          failedCases: 0,
          skippedCases: 0,
          durationMs: 1000,
        }),
        undefined
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already completed'),
        expect.any(Object),
        expect.any(String)
      );
    });

    it('should complete execution successfully', async () => {
      const mockExecution = {
        id: 123,
        status: 'running', // In progress
        startTime: new Date(),
      };

      mockRepoInstance.getTestRunDetail.mockResolvedValue(mockExecution);
      mockRepoInstance.findExecutionIdByRunId.mockResolvedValue(456);

      await service.completeBatchExecution(123, {
        status: 'success',
        passedCases: 5,
        failedCases: 0,
        skippedCases: 0,
        durationMs: 1000,
      });

      expect(mockRepoInstance.completeBatch).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          status: 'success',
          passedCases: 5,
          failedCases: 0,
          skippedCases: 0,
          durationMs: 1000,
        }),
        undefined
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('completed successfully'),
        expect.any(Object),
        expect.any(String)
      );
    });

    it('should throw error when execution not found', async () => {
      mockRepoInstance.getTestRunDetail.mockResolvedValue(null);

      await expect(service.completeBatchExecution(999, {
        status: 'success',
        passedCases: 5,
        failedCases: 0,
        skippedCases: 0,
        durationMs: 1000,
      })).rejects.toThrow('Execution not found: runId=999');
    });
  });

  describe('handleCallback', () => {
    it('should update execution status correctly', async () => {
      const mockExecution = {
        id: 456,
        status: 'running',
      };

      mockRepoInstance.getExecutionDetail.mockResolvedValue(mockExecution);
      // updateTestResult 返回 false 表示没有预创建记录，触发 createTestResult 新增
      mockRepoInstance.updateTestResult.mockResolvedValue(false);
      mockRepoInstance.countResultsByStatus.mockResolvedValue({ passed: 1, failed: 1, skipped: 0 });
      mockRepoInstance.runInTransaction.mockImplementation(async (callback) => {
        return callback({});
      });

      await service.handleCallback({
        executionId: 456,
        status: 'success',
        results: [
          {
            caseId: 1,
            caseName: 'test1',
            status: 'passed',
            duration: 100,
          },
          {
            caseId: 2,
            caseName: 'test2',
            status: 'failed',
            duration: 200,
            errorMessage: 'Test failed',
          },
        ],
        duration: 300,
      });

      // updateTestResult 返回 false 时会调用 createTestResult 新增结果
      expect(mockRepoInstance.createTestResult).toHaveBeenCalled();
      expect(mockRepoInstance.updateExecutionResults).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          status: 'success',
          passedCases: 1,
          failedCases: 1,
          skippedCases: 0,
        })
      );
    });

    it('should handle status mapping (aborted -> cancelled)', async () => {
      const mockExecution = {
        id: 456,
        status: 'running',
      };

      mockRepoInstance.getExecutionDetail.mockResolvedValue(mockExecution);
      mockRepoInstance.runInTransaction.mockImplementation(async (callback) => {
        return callback({});
      });

      await service.handleCallback({
        executionId: 456,
        status: 'aborted', // Should be mapped to 'cancelled'
        results: [],
        duration: 100,
      });

      expect(mockRepoInstance.updateExecutionResults).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          status: 'cancelled', // Mapped status
        })
      );
    });

    it('should throw error when execution not found', async () => {
      mockRepoInstance.getExecutionDetail.mockResolvedValue(null);

      await expect(service.handleCallback({
        executionId: 999,
        status: 'success',
        results: [],
        duration: 100,
      })).rejects.toThrow('Execution not found: 999');
    });
  });

  describe('recordTriggerFailureDiagnostics', () => {
    it('marks target case results as failed and stores trigger diagnostics', async () => {
      mockRepoInstance.findExecutionIdByRunId.mockResolvedValue(456);

      await service.recordTriggerFailureDiagnostics({
        runId: 123,
        caseIds: [11, 12],
        errorMessage: 'Jenkins trigger failed before build start: Jenkins account lacks Job/Build permission.',
        errorStack: 'phase=trigger\nkind=permission',
        logPath: 'http://jenkins.wiac.xyz/job/api-automation/',
      });

      expect(mockRepoInstance.updateTestResult).toHaveBeenCalledTimes(2);
      expect(mockRepoInstance.updateTestResult).toHaveBeenNthCalledWith(
        1,
        456,
        11,
        expect.objectContaining({
          status: 'failed',
          duration: 0,
          errorMessage: 'Jenkins trigger failed before build start: Jenkins account lacks Job/Build permission.',
          errorStack: 'phase=trigger\nkind=permission',
          logPath: 'http://jenkins.wiac.xyz/job/api-automation/',
        })
      );
      expect(mockRepoInstance.updateTestResult).toHaveBeenNthCalledWith(
        2,
        456,
        12,
        expect.objectContaining({
          status: 'failed',
        })
      );
    });
  });

  describe('Cache Management', () => {
    it('should cleanup resources on destroy', () => {
      service.destroy();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('destroyed'),
        expect.any(Object),
        expect.any(String)
      );
    });
  });

  describe('verifyStatusConsistency', () => {
    it('should verify consistency for a single runId', async () => {
      const runId = 123;
      const mockExecution = {
        id: runId,
        status: 'running',
        jenkinsJob: 'test-job',
        jenkinsBuildId: '100',
      };

      mockRepoInstance.getTestRunStatus.mockResolvedValue(mockExecution);
      
      (jenkinsStatusService.getBuildStatus as any).mockResolvedValue({
        building: false,
        result: 'SUCCESS',
        number: 100,
        url: 'http://jenkins/job/100',
        duration: 1000,
      });

      const result = await service.verifyStatusConsistency({ runId });

      expect(mockRepoInstance.getTestRunStatus).toHaveBeenCalledWith(runId);
      expect(result.total).toBe(1);
      expect(result.inconsistent.length).toBe(1);
      expect(result.inconsistent[0].runId).toBe(runId);
      expect(result.inconsistent[0].platformStatus).toBe('running');
      expect(result.inconsistent[0].jenkinsStatus).toBe('success');
    });

    it('should verify consistency for multiple executions', async () => {
      const mockExecutions = [
        {
          id: 1,
          status: 'running',
          jenkinsJob: 'job1',
          jenkinsBuildId: '101',
        },
        {
          id: 2,
          status: 'success',
          jenkinsJob: 'job2',
          jenkinsBuildId: '102',
        }
      ];

      mockRepoInstance.getExecutionsWithJenkinsInfo.mockResolvedValue(mockExecutions);

      // Mock Jenkins responses
      (jenkinsStatusService.getBuildStatus as any)
        .mockResolvedValueOnce({ building: false, result: 'SUCCESS' }) // job1: running -> success (inconsistent)
        .mockResolvedValueOnce({ building: false, result: 'SUCCESS' }); // job2: success -> success (consistent)

      const result = await service.verifyStatusConsistency({ limit: 10 });

      expect(mockRepoInstance.getExecutionsWithJenkinsInfo).toHaveBeenCalledWith(10);
      expect(result.total).toBe(2);
      expect(result.inconsistent.length).toBe(1);
      expect(result.inconsistent[0].runId).toBe(1);
    });
  });
});
