import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrunoAutomationService } from '../../../server/services/BrunoAutomation/service';
import { executionService } from '../../../server/services/ExecutionService';

vi.mock('../../../server/services/ExecutionService', () => ({
  executionService: {
    triggerTestExecution: vi.fn(),
    completeBatchExecution: vi.fn(),
    recordTriggerFailureDiagnostics: vi.fn(),
  },
}));

describe('BrunoAutomationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (executionService.triggerTestExecution as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId: 100,
      executionId: 200,
      totalCases: 2,
      caseIds: [11, 12],
    });
  });

  it('runs Bruno and completes platform execution with parsed report', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    };
    const readJsonReport = vi.fn().mockResolvedValue({
      results: [
        { name: 'Create Order', status: 'passed', duration: 20 },
        { name: 'Get Order', status: 'failed', duration: 30, error: '500' },
      ],
    });

    const service = new BrunoAutomationService({
      runner,
      readJsonReport,
      resolveRepositoryCheckoutPath: vi.fn().mockResolvedValue('D:/repo'),
      artifactRoot: 'D:/artifacts',
    });

    const result = await service.runManual({
      projectId: 1,
      triggeredBy: 7,
      caseIds: [11, 12],
      caseNameById: new Map([
        [11, 'Create Order'],
        [12, 'Get Order'],
      ]),
      config: {
        repositoryId: 1,
        collectionPath: 'collections/order-api',
        targetType: 'collection',
        reporters: ['json', 'html'],
      },
    });

    expect(result).toEqual({ runId: 100, executionId: 200 });
    expect(runner.run).toHaveBeenCalled();
    expect(executionService.completeBatchExecution).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        status: 'failed',
        passedCases: 1,
        failedCases: 1,
        skippedCases: 0,
        durationMs: 50,
      }),
    );
  });
});
