import { jenkinsStatusService } from '../JenkinsStatusService';
import { LOG_CONTEXTS } from '../../config/logging';
import logger from '../../utils/logger';
import type { ExecutionRepository } from '../../repositories/ExecutionRepository';
import { ExecutionStatusConsistencyChecker } from './consistency';
import { ExecutionJenkinsResultSync } from './resultSync';
import { mapJenkinsStatusToInternal } from './statusMapping';
import type {
  ExecutionConsistencyResult,
  ExecutionStatusSyncResult,
  ExecutionTimeoutCheckResult,
} from './statusTypes';
import { ExecutionTimeoutMonitor } from './timeoutMonitor';

export type {
  ExecutionConsistencyResult,
  ExecutionStatusSyncResult,
  ExecutionTimeoutCheckResult,
} from './statusTypes';

export class ExecutionStatusSyncHelper {
  private readonly resultSync: ExecutionJenkinsResultSync;
  private readonly timeoutMonitor: ExecutionTimeoutMonitor;
  private readonly consistencyChecker: ExecutionStatusConsistencyChecker;

  constructor(private readonly executionRepository: ExecutionRepository) {
    this.resultSync = new ExecutionJenkinsResultSync(executionRepository);
    this.timeoutMonitor = new ExecutionTimeoutMonitor(
      executionRepository,
      (runId) => this.syncExecutionStatusFromJenkins(runId),
    );
    this.consistencyChecker = new ExecutionStatusConsistencyChecker(executionRepository);
  }

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

      const jenkinsStatusMapped = mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

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
        : await this.resultSync.updateExecutionStatusFromJenkins(runId, {
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
            await this.resultSync.updateExecutionStatusFromJenkins(runId, {
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

  async checkAndHandleTimeouts(timeoutMs: number = 10 * 60 * 1000): Promise<ExecutionTimeoutCheckResult> {
    return this.timeoutMonitor.checkAndHandleTimeouts(timeoutMs);
  }

  async verifyStatusConsistency(options: { limit?: number; runId?: number } = {}): Promise<ExecutionConsistencyResult> {
    return this.consistencyChecker.verifyStatusConsistency(options);
  }
}
