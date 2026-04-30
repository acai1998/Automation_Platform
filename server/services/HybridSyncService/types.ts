import type {
  ExecutionCaseResult,
  ExecutionCompletionStatus,
} from '@shared/types/testExecution';

export interface CallbackData {
  runId: number;
  status: ExecutionCompletionStatus;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  durationMs: number;
  results?: ExecutionCaseResult[];
}

export interface MonitoringConfig {
  callbackTimeout: number;
  pollInterval: number;
  maxPollAttempts: number;
  consistencyCheckInterval: number;
}

export interface SyncStatus {
  runId: number;
  status: 'waiting_callback' | 'polling' | 'completed' | 'failed' | 'timeout';
  lastUpdate: Date;
  attempts: number;
  method: 'callback' | 'polling' | 'timeout';
  message: string;
}
