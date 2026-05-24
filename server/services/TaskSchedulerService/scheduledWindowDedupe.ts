import { queryOne } from '../../config/database';
import logger from '../../utils/logger';
import { LOG_CONTEXTS, LOG_EVENTS } from '../../config/logging';
import { MAX_MISSED_WINDOW_MS } from './config';
import { getPrevCronTime } from './cron';

export interface ScheduledWindowDedupeInput {
  taskId: number;
  cronExpression: string;
  scheduledFor?: Date;
  recentScheduledWindowsByTaskId: Map<number, Set<number>>;
}

export interface ScheduledWindowDedupeResult {
  duplicated: boolean;
  windowStart: Date | null;
  reason?: string;
}

function rememberScheduledWindow(
  recentScheduledWindowsByTaskId: Map<number, Set<number>>,
  taskId: number,
  windowStartMs: number
): void {
  let windows = recentScheduledWindowsByTaskId.get(taskId);
  if (!windows) {
    windows = new Set<number>();
    recentScheduledWindowsByTaskId.set(taskId, windows);
  }

  const cutoffMs = Date.now() - MAX_MISSED_WINDOW_MS;
  for (const rememberedWindow of windows) {
    if (rememberedWindow < cutoffMs) {
      windows.delete(rememberedWindow);
    }
  }

  windows.add(windowStartMs);
}

function hasRememberedScheduledWindow(
  recentScheduledWindowsByTaskId: Map<number, Set<number>>,
  taskId: number,
  windowStartMs: number
): boolean {
  const windows = recentScheduledWindowsByTaskId.get(taskId);
  return windows?.has(windowStartMs) ?? false;
}

export async function isDuplicateScheduledWindow({
  taskId,
  cronExpression,
  scheduledFor,
  recentScheduledWindowsByTaskId,
}: ScheduledWindowDedupeInput): Promise<ScheduledWindowDedupeResult> {
  const now = new Date();
  const windowStart = scheduledFor && !Number.isNaN(scheduledFor.getTime())
    ? scheduledFor
    : getPrevCronTime(
      cronExpression,
      new Date(now.getTime() + 1000),
      MAX_MISSED_WINDOW_MS,
    );

  if (!windowStart) {
    logger.debug(`Unable to compute previous cron window for task ${taskId}`, {
      event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
      taskId,
      cronExpression,
      scheduledFor: scheduledFor?.toISOString() ?? null,
    }, LOG_CONTEXTS.EXECUTION);
    return { duplicated: false, windowStart: null, reason: 'window_unavailable' };
  }

  const windowStartMs = windowStart.getTime();
  const windowStartIso = windowStart.toISOString();

  if (hasRememberedScheduledWindow(recentScheduledWindowsByTaskId, taskId, windowStartMs)) {
    logger.info(`Task ${taskId} duplicate detected by memory guard`, {
      event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
      taskId,
      windowStart: windowStartIso,
      reason: 'memory_guard',
    }, LOG_CONTEXTS.EXECUTION);
    return { duplicated: true, windowStart, reason: 'memory_guard' };
  }

  rememberScheduledWindow(recentScheduledWindowsByTaskId, taskId, windowStartMs);

  let auditMatch: { id: number } | null = null;
  try {
    auditMatch = await queryOne<{ id: number }>(
      `SELECT id
       FROM Auto_TaskAuditLogs
       WHERE task_id = ?
         AND action = 'triggered'
         AND JSON_VALID(metadata)
         AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.scheduledFor')) = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [taskId, windowStartIso],
    );
  } catch (err) {
    logger.warn(`Task ${taskId} scheduled window audit guard failed, continuing with memory guard`, {
      event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
      taskId,
      windowStart: windowStartIso,
      error: err instanceof Error ? err.message : String(err),
    }, LOG_CONTEXTS.EXECUTION);
  }

  if (auditMatch) {
    logger.info(`Task ${taskId} duplicate detected by scheduled window audit guard`, {
      event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
      taskId,
      windowStart: windowStartIso,
      reason: 'audit_window_guard',
    }, LOG_CONTEXTS.EXECUTION);
    return { duplicated: true, windowStart, reason: 'audit_window_guard' };
  }

  if (!scheduledFor) {
    const lastExecution = await queryOne<{ id: number; created_at: string | null }>(
      `SELECT id, created_at
       FROM Auto_TestCaseTaskExecutions
       WHERE task_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [taskId],
    );

    if (lastExecution?.created_at) {
      const lastCreatedAt = new Date(lastExecution.created_at).getTime();
      const toleranceMs = parseInt(process.env.SCHEDULER_DEDUPE_TOLERANCE_MS || '5000', 10);
      if (!Number.isNaN(lastCreatedAt) && lastCreatedAt >= (windowStartMs - toleranceMs)) {
        logger.info(`Task ${taskId} duplicate detected by DB guard`, {
          event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
          taskId,
          windowStart: windowStartIso,
          lastExecutionCreatedAt: new Date(lastCreatedAt).toISOString(),
          toleranceMs,
          reason: 'db_guard',
        }, LOG_CONTEXTS.EXECUTION);
        return { duplicated: true, windowStart, reason: 'db_guard' };
      }
    }
  } else {
    logger.debug(`Task ${taskId} skipped legacy DB duplicate guard for explicit scheduled window`, {
      event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
      taskId,
      windowStart: windowStartIso,
      reason: 'explicit_scheduled_window',
    }, LOG_CONTEXTS.EXECUTION);
  }

  return { duplicated: false, windowStart };
}
