import { jenkinsStatusService } from '../JenkinsStatusService';
import { LOG_CONTEXTS } from '../../config/logging';
import logger from '../../utils/logger';
import type { ExecutionRepository } from '../../repositories/ExecutionRepository';
import { mapJenkinsStatusToInternal } from './statusMapping';
import type { ExecutionConsistencyResult } from './statusTypes';

export class ExecutionStatusConsistencyChecker {
  constructor(private readonly executionRepository: ExecutionRepository) {}

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
            const jenkinsStatus = mapJenkinsStatusToInternal(buildStatus.result, buildStatus.building);

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
