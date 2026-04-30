import { Cron } from 'croner';

const SCHEDULED_FIRE_LOOKAHEAD_MS = 1000;

export function getNextCronTime(expr: string, from: Date = new Date()): Date | null {
  try {
    const job = new Cron(expr, { paused: true });
    return job.nextRun(from) ?? null;
  } catch {
    return null;
  }
}

export function getPrevCronTime(
  expr: string,
  before: Date,
  maxWindowMs: number,
): Date | null {
  try {
    const job = new Cron(expr, { paused: true });
    const windowStart = new Date(before.getTime() - maxWindowMs);
    let prev: Date | null = null;
    let cursor = windowStart;
    let safetyLimit = Math.ceil(maxWindowMs / 60_000) + 10;
    while (safetyLimit-- > 0) {
      const next = job.nextRun(cursor);
      if (!next || next >= before) break;
      prev = next;
      cursor = next;
    }
    return prev;
  } catch {
    return null;
  }
}

export interface ScheduledFireWindowCheck {
  expectedDueAt: Date | null;
  shouldDispatch: boolean;
}

export function evaluateScheduledFireWindow(
  expr: string,
  dueAt: Date,
  now: Date,
  maxWindowMs: number,
  lookAheadMs: number = SCHEDULED_FIRE_LOOKAHEAD_MS,
): ScheduledFireWindowCheck {
  const expectedDueAt = getPrevCronTime(
    expr,
    new Date(now.getTime() + lookAheadMs),
    maxWindowMs,
  );

  if (!expectedDueAt) {
    return {
      expectedDueAt: null,
      shouldDispatch: false,
    };
  }

  return {
    expectedDueAt,
    shouldDispatch: Math.abs(expectedDueAt.getTime() - dueAt.getTime()) <= lookAheadMs,
  };
}
