import {
  QUEUE_ITEM_TIMEOUT_MS,
  SCHEDULED_QUEUE_ITEM_TIMEOUT_MS,
} from './config';
import type { QueueItem } from './types';

type TriggerReason = QueueItem['triggerReason'];
type QueueIdentity = Pick<QueueItem, 'taskId' | 'triggerReason' | 'scheduledFor'>;

function scheduledWindowMs(value?: Date): number | null {
  if (!value) return null;
  const time = value.getTime();
  return Number.isNaN(time) ? null : time;
}

export function getQueueItemTimeoutMs(triggerReason: TriggerReason): number {
  return triggerReason === 'scheduled'
    ? SCHEDULED_QUEUE_ITEM_TIMEOUT_MS
    : QUEUE_ITEM_TIMEOUT_MS;
}

export function isDuplicateQueuedDispatch(
  existing: QueueIdentity,
  candidate: QueueIdentity,
): boolean {
  if (existing.taskId !== candidate.taskId) {
    return false;
  }

  if (candidate.triggerReason === 'scheduled') {
    if (existing.triggerReason !== 'scheduled') {
      return false;
    }

    const existingWindowMs = scheduledWindowMs(existing.scheduledFor);
    const candidateWindowMs = scheduledWindowMs(candidate.scheduledFor);
    if (existingWindowMs === null || candidateWindowMs === null) {
      return true;
    }

    return existingWindowMs === candidateWindowMs;
  }

  return true;
}
