import { LOG_CONTEXTS } from '../../config/logging';
import logger from '../../utils/logger';

export function mapJenkinsStatusToInternal(result: string | null, building: boolean): string {
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
