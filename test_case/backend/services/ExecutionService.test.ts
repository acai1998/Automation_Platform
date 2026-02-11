import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionService } from '../../../server/services/ExecutionService';
import { jenkinsStatusService } from '../../../server/services/JenkinsStatusService';
import logger from '../../../server/utils/logger';

// Hoist mock instance
const { mockRepoInstance } = vi.hoisted(() => {
  return {
    mockRepoInstance: {
      getExecutionsWithJenkinsInfo: vi.fn(),
      getTestRunStatus: vi.fn(),
      markExecutionRunning: vi.fn(),
      runInTransaction: vi.fn(),
      createTestResults: vi.fn(),
      updateExecutionResults: vi.fn(),
      getExecutionDetail: vi.fn(),
      getRecentExecutions: vi.fn(),
      cancelExecution: vi.fn(),
      triggerExecution: vi.fn(),
      getTestRunDetail: vi.fn(),
      getExecutionResults: vi.fn(),
      updateJenkinsInfo: vi.fn(),
      completeBatch: vi.fn(),
      findExecutionIdByRunId: vi.fn(),
      getTestRunBasicInfo: vi.fn(),
      getAllTestRuns: vi.fn(),
      getRunCases: vi.fn(),
      updateTestRunStatus: vi.fn(),
      getPotentiallyTimedOutExecutions: vi.fn(),
      markExecutionAsTimedOut: vi.fn(),
    }
  };
});

// Mock dependencies
vi.mock('../../../server/repositories/ExecutionRepository', () => {
  return {
    ExecutionRepository: class {
      constructor() {
        return mockRepoInstance;
      }
    }
  };
});
vi.mock('../../../server/services/JenkinsStatusService');
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
    // Reset mock implementation
    Object.values(mockRepoInstance).forEach((mock: any) => {
      if (mock.mockReset) mock.mockReset();
    });

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
    it('should skip duplicate completion (idempotency check)', async () => {
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

      // Should not call completeBatch since already completed
      expect(mockRepoInstance.completeBatch).not.toHaveBeenCalled();
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
        }),
        expect.any(Number)
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

      expect(mockRepoInstance.createTestResults).toHaveBeenCalled();
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
