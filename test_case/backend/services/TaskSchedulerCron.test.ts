import { describe, expect, it } from 'vitest';
import { evaluateScheduledFireWindow } from '@/../server/services/TaskSchedulerService/cron';

const MAX_MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;

describe('evaluateScheduledFireWindow', () => {
  it('allows the current cron window to dispatch normally', () => {
    const dueAt = new Date('2026-04-27T07:10:00.000Z');
    const now = new Date('2026-04-27T07:10:12.000Z');

    const result = evaluateScheduledFireWindow(
      '*/10 * * * *',
      dueAt,
      now,
      MAX_MISSED_WINDOW_MS,
    );

    expect(result.shouldDispatch).toBe(true);
    expect(result.expectedDueAt?.toISOString()).toBe('2026-04-27T07:10:00.000Z');
  });

  it('skips a stale timer callback from an old cron window', () => {
    const dueAt = new Date('2026-04-26T17:00:00.000Z');
    const now = new Date('2026-04-27T06:59:13.507Z');

    const result = evaluateScheduledFireWindow(
      '0 * * * *',
      dueAt,
      now,
      MAX_MISSED_WINDOW_MS,
    );

    expect(result.shouldDispatch).toBe(false);
    expect(result.expectedDueAt?.toISOString()).toBe('2026-04-27T06:00:00.000Z');
  });
});
