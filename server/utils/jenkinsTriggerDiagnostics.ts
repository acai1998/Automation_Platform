import type { JenkinsErrorCategory, JenkinsTriggerResult } from '../services/JenkinsService';

export type JenkinsTriggerFailureKind =
  | 'crumb'
  | 'permission'
  | 'auth'
  | 'network'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'server_error'
  | 'unknown';

export interface JenkinsTriggerFailureDiagnostic {
  kind: JenkinsTriggerFailureKind;
  abortReason: string;
  errorMessage: string;
  errorStack: string;
  logPath?: string;
}

interface TriggerFailureContext {
  baseUrl?: string;
  jobName?: string;
  callbackUrl?: string;
  scriptPaths?: string[];
  caseIds?: number[];
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function classifyFailureKind(message: string, category: JenkinsErrorCategory): JenkinsTriggerFailureKind {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('no valid crumb') ||
    normalized.includes('invalid crumb') ||
    normalized.includes('crumb rejected') ||
    normalized.includes('crumb is missing')
  ) {
    return 'crumb';
  }

  if (
    normalized.includes('job/build permission') ||
    normalized.includes('lacks required job/build permission') ||
    normalized.includes('access denied') ||
    normalized.includes('permission')
  ) {
    return 'permission';
  }

  switch (category) {
    case 'auth_failed':
      return 'auth';
    case 'network':
      return 'network';
    case 'not_found':
      return 'not_found';
    case 'bad_request':
      return 'bad_request';
    case 'rate_limited':
      return 'rate_limited';
    case 'server_error':
      return 'server_error';
    default:
      return 'unknown';
  }
}

function buildErrorMessage(kind: JenkinsTriggerFailureKind): string {
  switch (kind) {
    case 'crumb':
      return 'Jenkins trigger failed before build start: crumb is missing, invalid, or rejected.';
    case 'permission':
      return 'Jenkins trigger failed before build start: Jenkins account lacks Job/Build permission.';
    case 'auth':
      return 'Jenkins trigger failed before build start: authentication or authorization was rejected by Jenkins.';
    case 'network':
      return 'Jenkins trigger failed before build start: Jenkins endpoint was unreachable.';
    case 'not_found':
      return 'Jenkins trigger failed before build start: target Jenkins job was not found or is inaccessible.';
    case 'bad_request':
      return 'Jenkins trigger failed before build start: Jenkins rejected the trigger request.';
    case 'rate_limited':
      return 'Jenkins trigger failed before build start: Jenkins rate limited the trigger request.';
    case 'server_error':
      return 'Jenkins trigger failed before build start: Jenkins returned a server error.';
    default:
      return 'Jenkins trigger failed before build start.';
  }
}

function buildLogPath(baseUrl?: string, jobName?: string): string | undefined {
  if (!baseUrl || !jobName) {
    return undefined;
  }

  return `${baseUrl.replace(/\/+$/, '')}/job/${encodeURIComponent(jobName)}/`;
}

function buildCallbackWarning(baseUrl?: string, callbackUrl?: string): string | undefined {
  if (!baseUrl || !callbackUrl) {
    return undefined;
  }

  try {
    const jenkinsHost = new URL(baseUrl).hostname.toLowerCase();
    const callbackHost = new URL(callbackUrl).hostname.toLowerCase();

    if (!isLocalHost(jenkinsHost) && isLocalHost(callbackHost)) {
      return 'warning=callback_url_points_to_localhost_while_jenkins_is_remote';
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function buildJenkinsTriggerFailureDiagnostic(
  triggerResult: Pick<JenkinsTriggerResult, 'message' | 'errorCategory'>,
  context: TriggerFailureContext = {}
): JenkinsTriggerFailureDiagnostic {
  const kind = classifyFailureKind(triggerResult.message, triggerResult.errorCategory);
  const errorMessage = buildErrorMessage(kind);
  const callbackWarning = buildCallbackWarning(context.baseUrl, context.callbackUrl);

  const detailLines = [
    'phase=trigger',
    `kind=${kind}`,
    `category=${triggerResult.errorCategory}`,
    `message=${triggerResult.message}`,
    context.jobName ? `job=${context.jobName}` : undefined,
    context.caseIds?.length ? `caseIds=${context.caseIds.join(',')}` : undefined,
    context.scriptPaths?.length ? `scriptPaths=${context.scriptPaths.join(',')}` : undefined,
    context.callbackUrl ? `callbackUrl=${context.callbackUrl}` : undefined,
    callbackWarning,
  ].filter((line): line is string => Boolean(line));

  return {
    kind,
    abortReason: `${errorMessage} Detail: ${triggerResult.message}`,
    errorMessage,
    errorStack: detailLines.join('\n'),
    logPath: buildLogPath(context.baseUrl, context.jobName),
  };
}
