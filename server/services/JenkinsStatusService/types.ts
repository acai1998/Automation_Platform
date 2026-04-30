import type {
  AggregatedTestResults,
  ExecutionCaseResult,
} from '@shared/types/testExecution';

export interface BuildStatus {
  building: boolean;
  result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
  number: number;
  url: string;
  timestamp: number;
  duration: number;
  estimatedDuration: number;
  actions: unknown[];
  changeSet?: {
    items: unknown[];
    kind: string;
  };
}

export interface QueueStatus {
  id: number;
  task: {
    name: string;
    url: string;
  };
  stuck: boolean;
  blocked: boolean;
  buildable: boolean;
  pending: boolean;
  cancelled: boolean;
  why?: string;
  inQueueSince: number;
  params?: string;
}

export type TestResults = AggregatedTestResults;

export type TestCaseResult = ExecutionCaseResult;

export interface MissingScriptPathDiagnostic {
  nodeId: string;
  filePath: string;
}

export interface JenkinsLogDiagnostics {
  missingScriptPaths: MissingScriptPathDiagnostic[];
  exitCode?: number;
  callbackStatus?: string;
  messages: string[];
  excerpt: string;
}
