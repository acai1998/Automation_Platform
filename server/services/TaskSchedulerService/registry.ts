import logger from '../../utils/logger';
import { LOG_CONTEXTS, LOG_EVENTS } from '../../config/logging';
import {
  MAX_MISSED_WINDOW_MS,
  SCHEDULER_USER_ID,
} from './config';
import {
  evaluateScheduledFireWindow,
  getNextCronTime,
  getPrevCronTime,
} from './cron';
import {
  loadAllScheduledTasks,
  loadLastRunAt,
  loadScheduledTaskById,
  loadScheduledTaskPollRows,
  mapPollRowToScheduledTask,
} from './taskQueries';
import type { ScheduledTask } from './types';

interface TaskSchedulerRegistryHelperDeps {
  taskCache: Map<number, ScheduledTask>;
  timers: Map<number, NodeJS.Timeout>;
  dispatchTask: (taskId: number, triggerReason?: 'scheduled' | 'manual' | 'retry', operatorId?: number) => Promise<void>;
  recordAuditLog: (taskId: number, action: string, operatorId: number | null, metadata: Record<string, unknown>) => Promise<void>;
  unregisterTask: (taskId: number) => void;
}

export class TaskSchedulerRegistryHelper {
  constructor(private readonly deps: TaskSchedulerRegistryHelperDeps) {}

  async loadAndRegisterAllTasks(): Promise<void> {
    const tasks = await loadAllScheduledTasks();

    logger.info(`Loaded ${tasks.length} scheduled tasks from DB`, { event: LOG_EVENTS.SCHEDULER_STARTED, count: tasks.length }, LOG_CONTEXTS.EXECUTION);

    for (const task of tasks) {
      this.deps.taskCache.set(task.id, task);

      if (task.status !== 'active') continue;

      await this.compensateMissedFires(task);
      this.scheduleTask(task);
    }
  }

  async loadTaskFromDb(taskId: number): Promise<ScheduledTask | null> {
    return loadScheduledTaskById(taskId);
  }

  async compensateMissedFires(task: ScheduledTask): Promise<void> {
    if (!task.lastRunAt) {
      return;
    }

    const now = new Date();
    const elapsed = now.getTime() - task.lastRunAt.getTime();

    if (elapsed > MAX_MISSED_WINDOW_MS) {
      logger.info(`Task ${task.id} (${task.name}) elapsed ${Math.floor(elapsed / 60_000)} min > MAX_MISSED_WINDOW, skip compensation`, {
        event: LOG_EVENTS.SCHEDULER_TASK_SKIPPED,
        taskId: task.id,
        lastRunAt: task.lastRunAt,
        elapsed,
        maxWindowMs: MAX_MISSED_WINDOW_MS,
      }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    const prevShouldRun = getPrevCronTime(task.cronExpression, now, MAX_MISSED_WINDOW_MS);

    if (!prevShouldRun || prevShouldRun <= task.lastRunAt) {
      return;
    }

    logger.info(`Task ${task.id} (${task.name}) missed fire detected. prevShouldRun=${prevShouldRun.toISOString()}, lastRunAt=${task.lastRunAt.toISOString()}, compensating...`, {
      event: LOG_EVENTS.SCHEDULER_TASK_MISSED_FIRE,
      taskId: task.id,
      lastRunAt: task.lastRunAt,
      prevShouldRun,
      elapsed,
    }, LOG_CONTEXTS.EXECUTION);

    await this.deps.recordAuditLog(task.id, 'compensated', SCHEDULER_USER_ID, {
      reason: 'missed_fire_compensation',
      lastRunAt: task.lastRunAt,
      prevShouldRun,
      elapsedMs: elapsed,
    });

    setImmediate(() => {
      logger.info(`Task ${task.id} compensation dispatch enqueued`, {
        event: LOG_EVENTS.SCHEDULER_TASK_COMPENSATION_DISPATCHED,
        taskId: task.id,
        source: 'missed_fire_compensation',
        prevShouldRun: prevShouldRun.toISOString(),
        lastRunAt: task.lastRunAt?.toISOString() ?? null,
      }, LOG_CONTEXTS.EXECUTION);
      this.deps.dispatchTask(task.id, 'scheduled').catch((err) => {
        logger.errorLog(err, `Compensation dispatch failed for task ${task.id}`, { event: LOG_EVENTS.SCHEDULER_TASK_COMPENSATION_FAILED });
      });
    });
  }

  scheduleTask(task: ScheduledTask): void {
    const existingTimer = this.deps.timers.get(task.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.deps.timers.delete(task.id);
      logger.debug(`Task ${task.id} cleared existing timer before re-scheduling`, {
        event: LOG_EVENTS.SCHEDULER_TASK_REGISTERED,
        taskId: task.id,
      }, LOG_CONTEXTS.EXECUTION);
    }

    const next = getNextCronTime(task.cronExpression);
    if (!next) {
      logger.warn(`Cannot compute next run time for task ${task.id}, expr=${task.cronExpression}`, {}, LOG_CONTEXTS.EXECUTION);
      return;
    }

    const delayMs = Math.max(0, next.getTime() - Date.now());

    const timer = setTimeout(async () => {
      this.deps.timers.delete(task.id);

      const freshTask = this.deps.taskCache.get(task.id);
      if (!freshTask || freshTask.status !== 'active') return;

      const firedAt = new Date();
      const fireWindow = evaluateScheduledFireWindow(
        freshTask.cronExpression,
        next,
        firedAt,
        MAX_MISSED_WINDOW_MS,
      );

      if (!fireWindow.shouldDispatch) {
        logger.warn(`Task ${task.id} timer fired outside the current cron window, skipping stale dispatch`, {
          event: LOG_EVENTS.SCHEDULER_TASK_SKIPPED,
          taskId: task.id,
          dueAt: next.toISOString(),
          firedAt: firedAt.toISOString(),
          expectedDueAt: fireWindow.expectedDueAt?.toISOString() ?? null,
          cronExpression: freshTask.cronExpression,
          reason: 'stale_timer_callback',
        }, LOG_CONTEXTS.EXECUTION);

        const updatedTask = this.deps.taskCache.get(task.id);
        if (updatedTask && updatedTask.status === 'active') {
          this.scheduleTask(updatedTask);
        }
        return;
      }

      logger.info(`Task ${task.id} timer fired, dispatching scheduled execution`, {
        event: LOG_EVENTS.SCHEDULER_TASK_DISPATCHED,
        taskId: task.id,
        dueAt: next.toISOString(),
      }, LOG_CONTEXTS.EXECUTION);

      await this.deps.dispatchTask(task.id, 'scheduled').catch((err) => {
        logger.errorLog(err, `Scheduled dispatch failed for task ${task.id}`, { event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED });
      });

      const updatedTask = this.deps.taskCache.get(task.id);
      if (updatedTask && updatedTask.status === 'active') {
        this.scheduleTask(updatedTask);
      }
    }, delayMs);

    if (timer.unref) timer.unref();
    this.deps.timers.set(task.id, timer);

    logger.debug(`Task ${task.id} scheduled at ${next.toISOString()} (in ${Math.round(delayMs / 1000)}s)`, {
      event: LOG_EVENTS.SCHEDULER_TASK_REGISTERED,
      taskId: task.id,
    }, LOG_CONTEXTS.EXECUTION);
  }

  async pollTaskChanges(): Promise<void> {
    try {
      const rows = await loadScheduledTaskPollRows();
      const dbIds = new Set(rows.map((row) => row.id));

      for (const [id] of this.deps.taskCache) {
        if (!dbIds.has(id)) {
          this.deps.unregisterTask(id);
          logger.info(`Task ${id} removed from scheduler (deleted from DB)`, {}, LOG_CONTEXTS.EXECUTION);
        }
      }

      for (const row of rows) {
        if (!row.cron_expression) continue;
        const cached = this.deps.taskCache.get(row.id);

        if (!cached && row.status === 'active') {
          const lastRunAt = await loadLastRunAt(row.id).catch(() => null);
          const newTask = mapPollRowToScheduledTask(row, lastRunAt);
          if (!newTask) continue;

          this.deps.taskCache.set(row.id, newTask);
          await this.compensateMissedFires(newTask);
          this.scheduleTask(newTask);
          logger.info(`New task ${row.id} registered by poll`, { event: LOG_EVENTS.SCHEDULER_TASK_REGISTERED, taskId: row.id, lastRunAt }, LOG_CONTEXTS.EXECUTION);
        } else if (cached && cached.status !== row.status) {
          if (row.status !== 'active') {
            this.deps.unregisterTask(row.id);
          } else {
            this.deps.unregisterTask(row.id);
            const lastRunAt = await loadLastRunAt(row.id).catch(() => null);
            const reactivatedTask = mapPollRowToScheduledTask(row, lastRunAt);
            if (!reactivatedTask) continue;

            this.deps.taskCache.set(row.id, reactivatedTask);
            await this.compensateMissedFires(reactivatedTask);
            this.scheduleTask(reactivatedTask);
          }
        } else if (cached && cached.cronExpression !== row.cron_expression) {
          cached.cronExpression = row.cron_expression;
          this.deps.unregisterTask(row.id);
          this.deps.taskCache.set(row.id, cached);
          if (row.status === 'active') {
            this.scheduleTask(cached);
          }
        }
      }
    } catch (err) {
      logger.errorLog(err, 'TaskScheduler poll failed', { event: LOG_EVENTS.SCHEDULER_STARTED });
    }
  }
}
