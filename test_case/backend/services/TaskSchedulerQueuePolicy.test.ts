import { describe, expect, it } from 'vitest';
import {
  getQueueItemTimeoutMs,
  isDuplicateQueuedDispatch,
} from '@/../server/services/TaskSchedulerService/queuePolicy';
import {
  QUEUE_ITEM_TIMEOUT_MS,
  SLOT_HOLD_TIMEOUT_MS,
} from '@/../server/services/TaskSchedulerService/config';
import type { QueueItem } from '@/../server/services/TaskSchedulerService/types';

function queuedItem(params: {
  taskId: number;
  triggerReason: QueueItem['triggerReason'];
  scheduledFor?: Date;
}): Pick<QueueItem, 'taskId' | 'triggerReason' | 'scheduledFor'> {
  return params;
}

describe('TaskScheduler queue policy', () => {
  it('allows the same scheduled task to queue distinct cron windows', () => {
    const existing = queuedItem({
      taskId: 7,
      triggerReason: 'scheduled',
      scheduledFor: new Date('2026-05-16T10:00:00.000Z'),
    });

    const duplicated = isDuplicateQueuedDispatch(existing, {
      taskId: 7,
      triggerReason: 'scheduled',
      scheduledFor: new Date('2026-05-16T10:00:00.000Z'),
    });
    const nextWindow = isDuplicateQueuedDispatch(existing, {
      taskId: 7,
      triggerReason: 'scheduled',
      scheduledFor: new Date('2026-05-16T10:10:00.000Z'),
    });

    expect(duplicated).toBe(true);
    expect(nextWindow).toBe(false);
  });

  it('keeps legacy de-duplication for queued dispatches without a cron window', () => {
    const existing = queuedItem({
      taskId: 7,
      triggerReason: 'scheduled',
    });

    expect(isDuplicateQueuedDispatch(existing, {
      taskId: 7,
      triggerReason: 'scheduled',
    })).toBe(true);
  });

  it('keeps scheduled queue entries alive longer than running slots', () => {
    expect(getQueueItemTimeoutMs('scheduled')).toBeGreaterThan(SLOT_HOLD_TIMEOUT_MS);
    expect(getQueueItemTimeoutMs('manual')).toBe(QUEUE_ITEM_TIMEOUT_MS);
    expect(getQueueItemTimeoutMs('retry')).toBe(QUEUE_ITEM_TIMEOUT_MS);
  });
});
