import type { TestResults } from '../JenkinsStatusService';
import { jenkinsStatusService } from '../JenkinsStatusService';
import { webSocketService } from '../WebSocketService';
import { LOG_CONTEXTS } from '../../config/logging';
import logger from '../../utils/logger';
import type { ExecutionRepository } from '../../repositories/ExecutionRepository';

export interface ExecutionStatusSyncResult {
  success: boolean;
  updated: boolean;
  message: string;
  currentStatus?: string;
  jenkinsStatus?: string;
}

export interface ExecutionConsistencyResult {
  total: number;
  inconsistent: Array<{
    runId: number;
    platformStatus: string;
    jenkinsStatus: string;
    buildId: string;
    jobName: string;
  }>;
}

export interface ExecutionTimeoutCheckResult {
  checked: number;
  timedOut: number;
  updated: number;
}

export class ExecutionStatusSyncHelper {
  constructor(private readonly executionRepository: ExecutionRepository) {}

  /**
   * 通过Jenkins API查询并同步执行状态
   * 作为回调机制的备用方案
   */
  async syncExecutionStatusFromJenkins(runId: number): Promise<ExecutionStatusSyncResult> {
    try {
      const execution = await this.executionRepository.getTestRunStatus(runId);

      if (!execution) {
        return {
          success: false,
          updated: false,
          message: `Execution not found: ${runId}`,
        };
      }

      if (!execution.jenkinsJob || !execution.jenkinsBuildId) {
        return {
          success: false,
          updated: false,
          message: 'No Jenkins job information available for this execution',
        };
      }

      const buildStatus = await jenkinsStatusService.getBuildStatus(
        execution.jenkinsJob,
        execution.jenkinsBuildId,
      );

      if (!buildStatus) {
        return {
          success: false,
          updated: false,
          message: `Failed to get Jenkins build status for ${execution.jenkinsJob}/${execution.jenkinsBuildId}`,
        };
      }

      const jenkinsStatusMapped = this.mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

      logger.debug('Jenkins status sync for runId', {
        runId,
        currentStatus: execution.status,
        jenkinsBuilding: buildStatus.building,
        jenkinsResult: buildStatus.result,
        jenkinsStatusMapped,
        buildNumber: buildStatus.number,
        buildUrl: buildStatus.url,
        buildDuration: buildStatus.duration,
      }, LOG_CONTEXTS.EXECUTION);

      if (execution.status === 'running' && !buildStatus.building && buildStatus.result) {
        logger.warn('Status inconsistency detected', {
          runId,
          platformStatus: 'running',
          jenkinsResult: buildStatus.result,
          message: `Platform shows 'running' but Jenkins shows completed with result '${buildStatus.result}'`,
        }, LOG_CONTEXTS.EXECUTION);
      }

      const statusAlreadySynced = execution.status === jenkinsStatusMapped;

      const updated = statusAlreadySynced
        ? false
        : await this.updateExecutionStatusFromJenkins(runId, {
            status: jenkinsStatusMapped,
            building: buildStatus.building,
            duration: buildStatus.duration,
          });

      if (!buildStatus.building && buildStatus.result) {
        try {
          const testResults = await jenkinsStatusService.parseBuildResults(
            execution.jenkinsJob,
            execution.jenkinsBuildId,
          );

          if (testResults) {
            await this.updateExecutionStatusFromJenkins(runId, {
              status: jenkinsStatusMapped,
              building: buildStatus.building,
              duration: buildStatus.duration,
              testResults,
            });
          }
        } catch (detailError) {
          logger.warn('Failed to enrich execution with Jenkins test details', {
            runId,
            jenkinsJob: execution.jenkinsJob,
            jenkinsBuildId: execution.jenkinsBuildId,
            error: detailError instanceof Error ? detailError.message : String(detailError),
          }, LOG_CONTEXTS.EXECUTION);
        }
      }

      return {
        success: true,
        updated,
        message: updated ? 'Status updated successfully' : 'Status already up to date; details synchronized when available',
        currentStatus: execution.status,
        jenkinsStatus: jenkinsStatusMapped,
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to sync status for runId', {
        runId,
      });
      return {
        success: false,
        updated: false,
        message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 映射Jenkins状态到内部状态
   * 支持 Jenkins 所有可能的构建状态
   */
  private mapJenkinsStatusToInternal(result: string | null, building: boolean): string {
    logger.debug(`Mapping Jenkins status: building=${building}, result=${result}`, {}, LOG_CONTEXTS.EXECUTION);

    if (building) {
      return 'running';
    }

    if (result === null) {
      logger.warn('Jenkins result is null - build may still be in progress or just finished', {}, LOG_CONTEXTS.EXECUTION);
      return 'pending';
    }

    const normalizedResult = result.toUpperCase();

    switch (normalizedResult) {
      case 'SUCCESS':
        return 'success';
      case 'FAILURE':
      case 'UNSTABLE':
        return 'failed';
      case 'ABORTED':
        return 'aborted';
      case 'NOT_BUILT':
      case 'QUEUED':
      case 'PAUSED':
        return 'pending';
      default:
        logger.warn(`Unknown Jenkins result status: ${result}, defaulting to pending (not failed)`, {
          result,
          building,
        }, LOG_CONTEXTS.EXECUTION);
        return 'pending';
    }
  }

  /**
   * 根据Jenkins状态更新运行记录
   */
  private async updateExecutionStatusFromJenkins(runId: number, jenkinsData: {
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

  /**
   * 更新测试用例结果
   */
  private async updateTestResultsFromJenkins(runId: number, testResults: TestResults): Promise<void> {
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

  /**
   * 检查并处理超时的执行
   */
  async checkAndHandleTimeouts(timeoutMs: number = 10 * 60 * 1000): Promise<ExecutionTimeoutCheckResult> {
    try {
      const timeoutThreshold = new Date(Date.now() - timeoutMs);
      const runningExecutions = await this.executionRepository.getPotentiallyTimedOutExecutions(timeoutThreshold);

      logger.info(`Checking ${runningExecutions.length} potentially timed out executions`, {
        threshold: timeoutThreshold.toISOString(),
      }, LOG_CONTEXTS.EXECUTION);

      let timedOutCount = 0;
      let updatedCount = 0;
      const CONCURRENCY = 5;

      for (let i = 0; i < runningExecutions.length; i += CONCURRENCY) {
        const batch = runningExecutions.slice(i, i + CONCURRENCY);

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

  /**
   * 标记执行为超时状态
   */
  private async markExecutionAsTimedOut(runId: number): Promise<void> {
    await this.executionRepository.markExecutionAsTimedOut(runId);
    logger.warn('Execution marked as timed out', {
      runId,
      updateSource: 'timeout',
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * 处理单个超时执行
   */
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

  /**
   * 验证执行状态一致性
   */
  async verifyStatusConsistency(options: { limit?: number; runId?: number } = {}): Promise<ExecutionConsistencyResult> {
    const { limit = 50, runId } = options;

    try {
      let executions: Array<{
        id: number;
        status: string;
        jenkinsJob: string | null;
        jenkinsBuildId: string | null;
      }> = [];

      if (runId) {
        const execution = await this.executionRepository.getTestRunStatus(runId);
        if (execution && execution.jenkinsJob && execution.jenkinsBuildId) {
          executions = [execution];
        }
      } else {
        const allExecutions = await this.executionRepository.getExecutionsWithJenkinsInfo(limit);
        executions = allExecutions.filter((e): e is typeof e & { jenkinsJob: string; jenkinsBuildId: string } =>
          e.jenkinsJob !== null && e.jenkinsJob !== undefined &&
          e.jenkinsBuildId !== null && e.jenkinsBuildId !== undefined,
        );
      }

      const inconsistent: ExecutionConsistencyResult['inconsistent'] = [];

      for (const execution of executions) {
        try {
          if (!execution.jenkinsJob || !execution.jenkinsBuildId) {
            logger.debug('Skipping execution with missing Jenkins info', {
              runId: execution.id,
              hasJob: !!execution.jenkinsJob,
              hasBuildId: !!execution.jenkinsBuildId,
            }, LOG_CONTEXTS.EXECUTION);
            continue;
          }

          const buildStatus = await jenkinsStatusService.getBuildStatus(
            execution.jenkinsJob,
            execution.jenkinsBuildId,
          );

          if (buildStatus) {
            const jenkinsStatus = this.mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

            if (execution.status !== jenkinsStatus) {
              inconsistent.push({
                runId: execution.id,
                platformStatus: execution.status,
                jenkinsStatus,
                buildId: execution.jenkinsBuildId,
                jobName: execution.jenkinsJob,
              });
            }
          }
        } catch (error) {
          logger.error('Failed to verify consistency for execution', {
            runId: execution.id,
            error: error instanceof Error ? error.message : String(error),
          }, LOG_CONTEXTS.EXECUTION);
        }
      }

      return {
        total: executions.length,
        inconsistent,
      };
    } catch (error) {
      logger.errorLog(error, 'Failed to verify status consistency', { options });
      return { total: 0, inconsistent: [] };
    }
  }
}
