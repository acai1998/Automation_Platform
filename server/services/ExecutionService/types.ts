import type {
  ExecutionCaseResult,
  ExecutionCompletionStatus,
} from '@shared/types/testExecution';

export interface CaseExecutionInput {
  caseIds: number[];
  projectId: number;
  triggeredBy: number | null;
  triggerType: 'manual' | 'jenkins' | 'schedule';
  jenkinsJob?: string;
  runConfig?: Record<string, unknown>;
  taskId?: number;
  taskName?: string;
}

export interface ExecutionProgress {
  executionId: number;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
}

export type Auto_TestRunResultsInput = ExecutionCaseResult;

export interface ExecutionCallbackInput {
  executionId: number;
  status: ExecutionCompletionStatus;
  results: Auto_TestRunResultsInput[];
  duration: number;
  reportUrl?: string;
}

export interface ExecutionTriggerResult {
  runId: number;
  executionId: number;
  totalCases: number;
  caseIds: number[];
}
