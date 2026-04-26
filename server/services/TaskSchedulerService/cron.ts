import { Cron } from 'croner';

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
