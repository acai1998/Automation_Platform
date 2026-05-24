import { CONCURRENCY_LIMIT, MAX_QUEUE_DEPTH } from './config';
import type { DirectQueueItem, QueueItem, RunningSlot, ScheduledTask } from './types';

export interface TaskSchedulerStatusSnapshot {
  running: Array<{ taskId: number; runId: number; elapsedMs: number; label?: string }>;
  queued: Array<{
    taskId: number;
    triggerReason: string;
    waitMs: number;
    priority: number;
    queuePosition: number;
    scheduledFor?: string;
  }>;
  directQueued: Array<{ label: string; waitMs: number; queuePosition: number }>;
  scheduled: number[];
  concurrencyLimit: number;
  queueDepth: number;
  directQueueDepth: number;
  maxQueueDepth: number;
}

interface BuildSchedulerStatusInput {
  runningSlots: Map<number, RunningSlot>;
  waitQueue: QueueItem[];
  directQueue: DirectQueueItem[];
  taskCache: Map<number, ScheduledTask>;
}

export function buildSchedulerStatus({
  runningSlots,
  waitQueue,
  directQueue,
  taskCache,
}: BuildSchedulerStatusInput): TaskSchedulerStatusSnapshot {
  const now = Date.now();

  return {
    running: Array.from(runningSlots.values()).map(slot => ({
      taskId: slot.taskId,
      runId: slot.runId,
      elapsedMs: now - slot.startedAt,
      label: slot.label,
    })),
    queued: waitQueue.map((item, idx) => ({
      taskId: item.taskId,
      triggerReason: item.triggerReason,
      waitMs: now - item.enqueuedAt,
      priority: item.priority,
      queuePosition: idx + 1,
      scheduledFor: item.scheduledFor?.toISOString(),
    })),
    directQueued: directQueue.map((item, idx) => ({
      label: item.label,
      waitMs: now - item.enqueuedAt,
      queuePosition: idx + 1,
    })),
    scheduled: Array.from(taskCache.keys()),
    concurrencyLimit: CONCURRENCY_LIMIT,
    queueDepth: waitQueue.length,
    directQueueDepth: directQueue.length,
    maxQueueDepth: MAX_QUEUE_DEPTH,
  };
}
