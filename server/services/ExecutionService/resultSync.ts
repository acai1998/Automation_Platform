import type { TestResults } from '../JenkinsStatusService';
import { webSocketService } from '../WebSocketService';
import { LOG_CONTEXTS } from '../../config/logging';
import logger from '../../utils/logger';
import type { ExecutionRepository } from '../../repositories/ExecutionRepository';

export class ExecutionJenkinsResultSync {
  constructor(private readonly executionRepository: ExecutionRepository) {}

  async updateExecutionStatusFromJenkins(runId: number, jenkinsData: {
    status: string;
    building: boolean;
    duration: number;
    testResults?: TestResults | null;
  }): Promise<boolean> {
    try {
      if (jenkinsData.building) {
        await this.executionRepository.updateTestRunStatus(runId, 'running');
        await this.executionRepository.syncTaskExecutionFromTestRunStatus(runId, 'running');
        logger.debug(`Execution status refreshed from Jenkins (runId=${runId})`, {
          status: 'running',
          updateSource: 'jenkins_poll',
        }, LOG_CONTEXTS.EXECUTION);

        webSocketService?.pushExecutionUpdate(runId, {
          status: 'running',
          source: 'polling',
        });
      } else {
        const hasJenkinsSummary = Boolean(
          jenkinsData.testResults &&
          (jenkinsData.testResults.passedCases + jenkinsData.testResults.failedCases + jenkinsData.testResults.skippedCases) > 0,
        );
        const summaryPassedCases = hasJenkinsSummary ? jenkinsData.testResults?.passedCases : undefined;
        const summaryFailedCases = hasJenkinsSummary ? jenkinsData.testResults?.failedCases : undefined;
        const summarySkippedCases = hasJenkinsSummary ? jenkinsData.testResults?.skippedCases : undefined;

        await this.executionRepository.updateTestRunStatus(runId, jenkinsData.status, {
          durationMs: jenkinsData.duration,
          passedCases: summaryPassedCases,
          failedCases: summaryFailedCases,
          skippedCases: summarySkippedCases,
        });
        await this.executionRepository.syncTaskExecutionFromTestRunStatus(runId, jenkinsData.status, {
          durationMs: jenkinsData.duration,
          passedCases: summaryPassedCases,
          failedCases: summaryFailedCases,
          skippedCases: summarySkippedCases,
        });

        logger.info(`Execution status updated from Jenkins poll (runId=${runId})`, {
          status: jenkinsData.status,
          durationMs: jenkinsData.duration,
          updateSource: 'jenkins_poll',
          resultsCount: jenkinsData.testResults?.results.length || 0,
        }, LOG_CONTEXTS.EXECUTION);

        webSocketService?.pushExecutionUpdate(runId, {
          status: jenkinsData.status,
          passedCases: summaryPassedCases,
          failedCases: summaryFailedCases,
          skippedCases: summarySkippedCases,
          durationMs: jenkinsData.duration,
          source: 'polling',
        });

        if (jenkinsData.testResults && jenkinsData.testResults.results.length > 0) {
          await this.updateTestResultsFromJenkins(runId, jenkinsData.testResults);
        } else {
          const effectiveCleanupStatus = jenkinsData.status;

          try {
            const executionId = await this.executionRepository.findExecutionIdByRunId(runId);
            if (executionId) {
              const cleaned = await this.executionRepository.cleanupErrorPlaceholdersForExecution(
                executionId,
                effectiveCleanupStatus,
              );
              if (cleaned > 0) {
                const finalCounts = await this.executionRepository.countResultsByStatus(executionId);
                const reconciledStatus = finalCounts.failed > 0 ? 'failed' : effectiveCleanupStatus;
                await this.executionRepository.updateTestRunStatus(runId, reconciledStatus, {
                  passedCases: finalCounts.passed,
                  failedCases: finalCounts.failed,
                  skippedCases: finalCounts.skipped,
                });
                await this.executionRepository.syncTaskExecutionFromTestRunStatus(runId, reconciledStatus, {
                  passedCases: finalCounts.passed,
                  failedCases: finalCounts.failed,
                  skippedCases: finalCounts.skipped,
                });
                logger.info('Cleaned error placeholders (no JUnit results) and reconciled summary', {
                  runId,
                  executionId,
                  cleaned,
                  finalCounts,
                  reconciledStatus,
                  jenkinsStatus: jenkinsData.status,
                  effectiveCleanupStatus,
                }, LOG_CONTEXTS.EXECUTION);
              }
            }
          } catch (cleanupErr) {
            logger.warn('Failed to cleanup error placeholders after Jenkins poll (no results)', {
              runId,
              error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            }, LOG_CONTEXTS.EXECUTION);
          }
        }

        if (['success', 'failed', 'aborted'].includes(jenkinsData.status)) {
          try {
            const executionId = await this.executionRepository.findExecutionIdByRunId(runId);
            if (executionId) {
              const finalCounts = await this.executionRepository.countResultsByStatus(executionId);
              const hasPersistedResults = (finalCounts.passed + finalCounts.failed + finalCounts.skipped) > 0;

              if (hasPersistedResults) {
                const reconciledStatus = finalCounts.failed > 0 ? 'failed' : jenkinsData.status;
                await this.executionRepository.updateTestRunStatus(runId, reconciledStatus, {
                  durationMs: jenkinsData.duration,
                  passedCases: finalCounts.passed,
                  failedCases: finalCounts.failed,
                  skippedCases: finalCounts.skipped,
                });
                await this.executionRepository.syncTaskExecutionFromTestRunStatus(runId, reconciledStatus, {
                  durationMs: jenkinsData.duration,
                  passedCases: finalCounts.passed,
                  failedCases: finalCounts.failed,
                  skippedCases: finalCounts.skipped,
                });
              }
            }
          } catch (reconcileError) {
            logger.warn('Failed to reconcile result summary after Jenkins poll', {
              runId,
              error: reconcileError instanceof Error ? reconcileError.message : String(reconcileError),
            }, LOG_CONTEXTS.EXECUTION);
          }
        }
      }

      return true;
    } catch (error) {
      logger.errorLog(error, 'Failed to update execution status', {
        runId,
      });
      return false;
    }
  }

  async updateTestResultsFromJenkins(runId: number, testResults: TestResults): Promise<void> {
    const executionId = await this.executionRepository.findExecutionIdByRunId(runId);

    if (!executionId) {
      throw new Error(`Could not find executionId for runId ${runId}`);
    }

    for (const result of testResults.results) {
      try {
        const startTime = result.startTime ? new Date(result.startTime) : new Date();
        const endTime = result.endTime ? new Date(result.endTime) : new Date();
        const caseId = result.caseId && result.caseId > 0 ? result.caseId : undefined;

        const updated = await this.executionRepository.updateTestResult(executionId, caseId, {
          caseName: result.caseName,
          status: result.status,
          duration: result.duration,
          errorMessage: result.errorMessage,
          errorStack: result.stackTrace,
          screenshotPath: result.screenshotPath,
          logPath: result.logPath,
          assertionsTotal: result.assertionsTotal,
          assertionsPassed: result.assertionsPassed,
          responseData: result.responseData,
          startTime,
          endTime,
        });

        if (!updated && caseId) {
          await this.executionRepository.createTestResult({
            executionId,
            caseId,
            caseName: result.caseName,
            status: result.status,
            duration: result.duration,
            errorMessage: result.errorMessage,
            errorStack: result.stackTrace,
            screenshotPath: result.screenshotPath,
            logPath: result.logPath,
            assertionsTotal: result.assertionsTotal,
            assertionsPassed: result.assertionsPassed,
            responseData: result.responseData,
            startTime,
            endTime,
          });
        }
      } catch (error) {
        logger.errorLog(error, 'Failed to update test result for case', {
          runId,
          caseId: result.caseId,
          caseName: result.caseName,
        });
      }
    }

    try {
      const run = await this.executionRepository.getTestRunStatus(runId);
      if (run && ['success', 'failed', 'aborted'].includes(run.status)) {
        await this.executionRepository.cleanupErrorPlaceholdersForExecution(
          executionId,
          run.status,
        );
      }
    } catch (cleanupError) {
      logger.warn('Failed to cleanup error placeholders during polling sync', {
        runId,
        executionId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      }, LOG_CONTEXTS.EXECUTION);
    }
  }
}
