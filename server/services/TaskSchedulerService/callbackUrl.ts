import logger from '../../utils/logger';
import { LOG_CONTEXTS } from '../../config/logging';

const DEFAULT_JENKINS_URL = 'http://jenkins.wiac.xyz';

export function warnIfCallbackUrlIsLocal(callbackUrl: string, traceId?: string): void {
  try {
    const callbackHost = new URL(callbackUrl).hostname.toLowerCase();
    const jenkinsHost = new URL(process.env.JENKINS_URL || DEFAULT_JENKINS_URL).hostname.toLowerCase();
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

    if (localHosts.has(callbackHost) && !localHosts.has(jenkinsHost)) {
      logger.warn('Jenkins callback URL points to localhost while Jenkins is remote', {
        event: 'JENKINS_CALLBACK_URL_LOCALHOST_FOR_REMOTE',
        callbackUrl,
        jenkinsHost,
        traceId,
        suggestion: 'Set API_CALLBACK_URL to a URL that Jenkins can reach, otherwise scheduled callbacks may fail with 403 or never reach this service.',
      }, LOG_CONTEXTS.EXECUTION);
    }
  } catch (error) {
    logger.warn('Failed to validate Jenkins callback URL', {
      event: 'JENKINS_CALLBACK_URL_VALIDATE_FAILED',
      callbackUrl,
      traceId,
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.EXECUTION);
  }
}
