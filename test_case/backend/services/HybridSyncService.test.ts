import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HybridSyncService } from '../../../server/services/HybridSyncService';
import { executionService } from '../../../server/services/ExecutionService';
import { jenkinsStatusService } from '../../../server/services/JenkinsStatusService';
import logger from '../../../server/utils/logger';

// Mock dependencies
vi.mock('../../../server/services/ExecutionService', () => ({
  executionService: {
    completeBatchExecution: vi.fn(),
    syncExecutionStatusFromJenkins: vi.fn(),
    verifyStatusConsistency: vi.fn(),
  },
}));

vi.mock('../../../server/services/JenkinsStatusService', () => ({
  jenkinsStatusService: {
    getBuildStatus: vi.fn(),
  },
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

describe('HybridSyncService', () => {
  let service: HybridSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use shorter timeouts for testing
    process.env.CALLBACK_TIMEOUT = '100';
    process.env.POLL_INTERVAL = '50';
    process.env.MAX_POLL_ATTEMPTS = '3';
    service = new HybridSyncService();
  });

  afterEach(() => {
    // Clean up any running timers
    const statuses = service.getAllSyncStatuses();
    statuses.forEach(status => service.stopMonitoring(status.runId));
  });

  it('should start monitoring correctly', async () => {
    const runId = 123;
    await service.startMonitoring(runId);

    const status = service.getSyncStatus(runId);
    expect(status).toBeDefined();
    expect(status?.status).toBe('waiting_callback');
    expect(status?.method).toBe('callback');
  });

  it('should handle callback successfully', async () => {
    const runId = 123;
    await service.startMonitoring(runId);

    const callbackData = {
      runId,
      status: 'success' as const,
      passedCases: 10,
      failedCases: 0,
      skippedCases: 0,
      durationMs: 1000,
      results: [],
    };

    const result = await service.handleCallback(callbackData);

    expect(result.success).toBe(true);
    expect(executionService.completeBatchExecution).toHaveBeenCalledWith(runId, callbackData);
    
    // Should stop monitoring after success
    const status = service.getSyncStatus(runId);
    expect(status).toBeDefined();
    expect(status?.status).toBe('completed');
    expect(status?.message).toBe('Successfully processed callback');
  });

  it('should switch to polling on callback timeout', async () => {
    const runId = 124;
    vi.useFakeTimers();
    
    await service.startMonitoring(runId, { callbackTimeout: 1000 });
    
    // Fast forward time to trigger timeout
    await vi.advanceTimersByTimeAsync(1100);

    const status = service.getSyncStatus(runId);
    expect(status?.status).toBe('polling');
    expect(status?.method).toBe('polling');
    
    vi.useRealTimers();
  });

  it('should verify status consistency with runId', async () => {
    const runId = 125;
    await service.verifyStatusConsistency(runId);
    
    expect(executionService.verifyStatusConsistency).toHaveBeenCalledWith({ runId });
  });

  it('should verify status consistency without runId', async () => {
    await service.verifyStatusConsistency();
    
    expect(executionService.verifyStatusConsistency).toHaveBeenCalledWith({ limit: 50 });
  });
});
