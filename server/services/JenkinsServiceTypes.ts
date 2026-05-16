export interface JenkinsConfig {
  baseUrl: string;
  username: string;
  token: string;
  jobs: {
    api: string;
    ui: string;
    performance: string;
  };
  testRepoUrl?: string;
  testRepoBranch: string;
}

export interface JenkinsJobInspection {
  jobName: string;
  jobUrl: string;
  jobClass?: string;
  definitionClass?: string;
  parameterized: boolean;
  parameterNames: string[];
  triggerReady: boolean;
  scmUrl?: string;
  branchSpec?: string;
  scriptPath?: string;
  hasTimerTrigger: boolean;
  timerSpec?: string;
  issues: string[];
  recommendations: string[];
}

export type JenkinsErrorCategory =
  | 'none'
  | 'network'
  | 'auth_failed'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'server_error';

export function isJenkinsErrorRetryable(category: JenkinsErrorCategory): boolean {
  return category === 'network' || category === 'rate_limited' || category === 'server_error';
}

export interface JenkinsTriggerResult {
  success: boolean;
  queueId?: number;
  buildUrl?: string;
  buildNumber?: number;
  message: string;
  errorCategory: JenkinsErrorCategory;
}

export interface JenkinsQueueItem {
  id: number;
  why: string | null;
  cancelled: boolean;
  executable?: {
    number: number;
    url: string;
  };
}

export interface JenkinsCrumb {
  field: string;
  value: string;
  fetchedAt: number;
}

export interface JenkinsTriggerHttpResult {
  response: Response;
  errorText?: string;
}

export type BuildResolvedCallback = (
  buildNumber: number,
  buildUrl: string,
  queueWaitMs: number
) => Promise<void>;

export type BuildCancelledCallback = (reason: 'cancelled' | 'timeout') => Promise<void>;

export type CaseType = 'api' | 'ui' | 'performance';

export interface JenkinsQueueMetrics {
  totalPolls: number;
  resolvedCount: number;
  timeoutCount: number;
  waitTimeSamples: number[];
  totalWaitMs: number;
  avgWaitMs: number;
  maxWaitMs: number;
}
