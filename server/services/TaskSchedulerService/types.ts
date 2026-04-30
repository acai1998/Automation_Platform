export interface ScheduledTask {
  id: number;
  name: string;
  cronExpression: string;
  caseIds: number[];
  projectId: number;
  environmentId?: number;
  status: 'active' | 'paused' | 'archived';
  maxRetries: number;
  retryDelayMs: number;
  lastRunAt: Date | null;
}

export interface QueueItem {
  taskId: number;
  triggerReason: 'scheduled' | 'manual' | 'retry';
  operatorId?: number;
  enqueuedAt: number;
  priority: number;
  timeoutTimer?: NodeJS.Timeout;
}

export interface RunningSlot {
  taskId: number;
  runId: number;
  startedAt: number;
  timeoutTimer: NodeJS.Timeout;
  label?: string;
}

export interface DirectQueueItem {
  enqueuedAt: number;
  label: string;
  timeoutTimer?: NodeJS.Timeout;
  resolve: (placeholderRunId: number) => void;
  reject: (err: Error) => void;
}

export interface RetryState {
  taskId: number;
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  timer?: NodeJS.Timeout;
}
