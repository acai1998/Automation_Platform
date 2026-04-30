export type ExecutionCaseStatus = 'passed' | 'failed' | 'skipped' | 'error';

export type ExecutionCompletionStatus = 'success' | 'failed' | 'cancelled' | 'aborted';

export interface ExecutionCaseResult {
  caseId?: number;
  caseName: string;
  status: ExecutionCaseStatus;
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  screenshotPath?: string;
  logPath?: string;
  assertionsTotal?: number;
  assertionsPassed?: number;
  responseData?: string;
  startTime?: string | number;
  endTime?: string | number;
}

export interface AggregatedTestResults {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  duration: number;
  results: ExecutionCaseResult[];
}

export interface ExecutionCompletionPayload {
  status: ExecutionCompletionStatus;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  durationMs: number;
  results?: ExecutionCaseResult[];
}
