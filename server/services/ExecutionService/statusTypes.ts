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
