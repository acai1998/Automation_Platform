import { LOG_CONTEXTS } from '../../config/logging';
import logger from '../../utils/logger';
import type { ExecutionRepository } from '../../repositories/ExecutionRepository';
import type { ExecutionStatusSyncResult, ExecutionTimeoutCheckResult } from './statusTypes';

export class ExecutionTimeoutMonitor {
  constructor(
    private readonly executionRepository: ExecutionRepository,
    private readonly syncExecutionStatusFromJenkins: (runId: number) => Promise<ExecutionStatusSyncResult>,
  ) {}

  async checkAndHandleTimeouts(timeoutMs: number = 10 * 60 * 1000): Promise<ExecutionTimeoutCheckResult> {
    try {
      const timeoutThreshold = new Date(Date.now() - timeoutMs);
      const runningExecutions = await this.executionRepository.getPotentiallyTimedOutExecutions(timeoutThreshold);

      logger.info(`Checking ${runningExecutions.length} potentially timed out executions`, {
        threshold: timeoutThreshold.toISOString(),
      }, LOG_CONTEXTS.EXECUTION);

      let timedOutCount = 0;
      let updatedCount = 0;
      const concurrency = 5;

      for (let i = 0; i < runningExecutions.length; i += concurrency) {
        const batch = runningExecutions.slice(i, i + concurrency);

        const outcomes = await Promise.allSettled(
          batch.map((execution) => this.handleSingleTimeout(execution.id)),
        );

        for (const outcome of outcomes) {
          if (outcome.status === 'rejected') {
            logger.error('Promise rejected during timeout check', {
              reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
            }, LOG_CONTEXTS.EXECUTION);
          } else if (outcome.value === 'updated') {
            updatedCount++;
          } else if (outcome.value === 'timedOut') {
            timedOutCount++;
          }
        }
      }

      logger.info('Timeout check completed', {
        total: runningExecutions.length,
        updated: updatedCount,
        timedOut: timedOutCount,
      }, LOG_CONTEXTS.EXECUTION);

      return {
        checked: runningExecutions.length,
        timedOut: timedOutCount,
        updated: updatedCount,
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to check timeouts', {});
      return { checked: 0, timedOut: 0, updated: 0 };
    }
  }

  private async markExecutionAsTimedOut(runId: number): Promise<void> {
    await this.executionRepository.markExecutionAsTimedOut(runId);
    logger.warn('Execution marked as timed out', {
      runId,
      updateSource: 'timeout',
    }, LOG_CONTEXTS.EXECUTION);
  }

  private async handleSingleTimeout(runId: number): Promise<'updated' | 'timedOut' | 'none'> {
    try {
      const syncResult = await this.syncExecutionStatusFromJenkins(runId);

      if (syncResult.success && syncResult.updated) {
        logger.info(`Execution updated from Jenkins during timeout check (runId=${runId})`, {
          runId,
          message: syncResult.message,
          updateSource: 'jenkins_poll',
        }, LOG_CONTEXTS.EXECUTION);
        return 'updated';
      }

      if (!syncResult.success) {
        await this.markExecutionAsTimedOut(runId);
        logger.warn('Execution marked as timed out during timeout check', {
          runId,
          message: syncResult.message,
          updateSource: 'timeout',
        }, LOG_CONTEXTS.EXECUTION);
        return 'timedOut';
      }

      return 'none';
    } catch (error) {
      logger.error('Failed to handle timeout for execution', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.EXECUTION);
      return 'none';
    }
  }
}
