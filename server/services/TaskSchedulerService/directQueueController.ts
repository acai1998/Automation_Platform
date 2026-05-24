import logger from '../../utils/logger';
import { LOG_CONTEXTS, LOG_EVENTS } from '../../config/logging';
import {
  CONCURRENCY_LIMIT,
  MAX_QUEUE_DEPTH,
  QUEUE_ITEM_TIMEOUT_MS,
  SLOT_HOLD_TIMEOUT_MS,
} from './config';
import type { DirectQueueItem, RunningSlot } from './types';

interface DirectQueueControllerOptions {
  runningSlots: Map<number, RunningSlot>;
  directQueue: DirectQueueItem[];
  drainScheduledQueue: () => void;
}

export class TaskSchedulerDirectQueueController {
  private placeholderRunIdCounter = 0;
  private readonly runningSlots: Map<number, RunningSlot>;
  private readonly directQueue: DirectQueueItem[];
  private readonly drainScheduledQueue: () => void;

  constructor(options: DirectQueueControllerOptions) {
    this.runningSlots = options.runningSlots;
    this.directQueue = options.directQueue;
    this.drainScheduledQueue = options.drainScheduledQueue;
  }

  enqueueDirectJob(label: string, job: (placeholderRunId: number) => Promise<void>): void {
    if (this.runningSlots.size < CONCURRENCY_LIMIT) {
      const placeholderRunId = this.nextPlaceholderRunId();
      const placeholderTimer = this.createPlaceholderTimer(placeholderRunId, label);

      this.runningSlots.set(placeholderRunId, {
        taskId: 0,
        runId: placeholderRunId,
        startedAt: Date.now(),
        timeoutTimer: placeholderTimer,
        label: `placeholder:${label}`,
      });

      logger.debug(`[Direct] Slot pre-allocated immediately (placeholder=${placeholderRunId}) for ${label}`, {
        event: LOG_EVENTS.SCHEDULER_SLOT_REGISTERED,
        slotsUsed: this.runningSlots.size,
        limit: CONCURRENCY_LIMIT,
      }, LOG_CONTEXTS.EXECUTION);

      setImmediate(() => job(placeholderRunId).catch(err => {
        logger.errorLog(err, `[Direct] Immediate job failed for ${label}`, { event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED, label });
      }));
      return;
    }

    if (this.directQueue.length >= MAX_QUEUE_DEPTH) {
      logger.warn(`[Direct] Queue full, rejecting ${label}`, {
        event: LOG_EVENTS.SCHEDULER_TASK_QUEUE_FULL,
        directQueueDepth: this.directQueue.length,
        maxQueueDepth: MAX_QUEUE_DEPTH,
      }, LOG_CONTEXTS.EXECUTION);
      throw new Error(`并发执行队列已满（${MAX_QUEUE_DEPTH}），请稍后再试`);
    }

    const item: DirectQueueItem = {
      enqueuedAt: Date.now(),
      label,
      resolve: (placeholderRunId: number) => {
        job(placeholderRunId).catch(err => {
          logger.errorLog(err, `[Direct] Queued job failed for ${label}`, { event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED, label });
        });
      },
      reject: (err: Error) => {
        logger.warn(`[Direct] Queued job rejected for ${label}: ${err.message}`, { event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED, label }, LOG_CONTEXTS.EXECUTION);
      },
    };

    item.timeoutTimer = setTimeout(() => {
      const idx = this.directQueue.indexOf(item);
      if (idx !== -1) {
        this.directQueue.splice(idx, 1);
        logger.warn(`[Direct] Queue item timed out for ${label}`, {
          event: LOG_EVENTS.SCHEDULER_TASK_QUEUE_TIMEOUT,
          waitMs: Date.now() - item.enqueuedAt,
        }, LOG_CONTEXTS.EXECUTION);
        item.reject(new Error(`排队等待超时（${Math.round(QUEUE_ITEM_TIMEOUT_MS / 1000)}秒），任务已取消`));
      }
    }, QUEUE_ITEM_TIMEOUT_MS);
    if (item.timeoutTimer.unref) item.timeoutTimer.unref();

    this.directQueue.push(item);

    logger.info(`[Direct] ${label} queued (concurrency limit ${CONCURRENCY_LIMIT} reached)`, {
      event: LOG_EVENTS.SCHEDULER_TASK_QUEUED,
      label,
      directQueuePosition: this.directQueue.length,
      slotsUsed: this.runningSlots.size,
    }, LOG_CONTEXTS.EXECUTION);

    setImmediate(() => this.drainDirectQueue());
  }

  async acquireDirectSlot(label: string): Promise<void> {
    if (this.runningSlots.size < CONCURRENCY_LIMIT) {
      logger.debug(`[Direct] Slot acquired immediately for ${label}`, {
        event: LOG_EVENTS.SCHEDULER_SLOT_REGISTERED,
        slotsUsed: this.runningSlots.size,
        limit: CONCURRENCY_LIMIT,
      }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    if (this.directQueue.length >= MAX_QUEUE_DEPTH) {
      logger.warn(`[Direct] Queue full, rejecting ${label}`, {
        event: LOG_EVENTS.SCHEDULER_TASK_QUEUE_FULL,
        directQueueDepth: this.directQueue.length,
        maxQueueDepth: MAX_QUEUE_DEPTH,
      }, LOG_CONTEXTS.EXECUTION);
      throw new Error(`并发执行队列已满（${MAX_QUEUE_DEPTH}），请稍后再试`);
    }

    return new Promise<void>((resolve, reject) => {
      const item: DirectQueueItem = {
        enqueuedAt: Date.now(),
        label,
        resolve: () => resolve(),
        reject,
      };

      item.timeoutTimer = setTimeout(() => {
        const idx = this.directQueue.indexOf(item);
        if (idx !== -1) {
          this.directQueue.splice(idx, 1);
          logger.warn(`[Direct] Queue item timed out for ${label}`, {
            event: LOG_EVENTS.SCHEDULER_TASK_QUEUE_TIMEOUT,
            waitMs: Date.now() - item.enqueuedAt,
          }, LOG_CONTEXTS.EXECUTION);
          reject(new Error(`Queue item timed out for ${label}`));
        }
      }, QUEUE_ITEM_TIMEOUT_MS);
      if (item.timeoutTimer.unref) item.timeoutTimer.unref();

      this.directQueue.push(item);

      logger.info(`[Direct] ${label} queued (concurrency limit ${CONCURRENCY_LIMIT} reached)`, {
        event: LOG_EVENTS.SCHEDULER_TASK_QUEUED,
        label,
        directQueuePosition: this.directQueue.length,
        slotsUsed: this.runningSlots.size,
      }, LOG_CONTEXTS.EXECUTION);
    });
  }

  registerDirectSlot(runId: number, label: string, placeholderRunId?: number): void {
    if (placeholderRunId !== undefined) {
      const placeholder = this.runningSlots.get(placeholderRunId);
      if (placeholder) {
        clearTimeout(placeholder.timeoutTimer);
        this.runningSlots.delete(placeholderRunId);
      }
    }

    const timeoutTimer = setTimeout(() => {
      const slot = this.runningSlots.get(runId);
      if (slot) {
        this.runningSlots.delete(runId);
        logger.warn(`[Direct] Slot for runId=${runId} (${label}) auto-released after timeout`, {
          event: LOG_EVENTS.SCHEDULER_SLOT_TIMEOUT,
          runId,
          label,
          heldMs: SLOT_HOLD_TIMEOUT_MS,
        }, LOG_CONTEXTS.EXECUTION);
        this.drainDirectQueue();
        this.drainScheduledQueue();
      }
    }, SLOT_HOLD_TIMEOUT_MS);

    if (timeoutTimer.unref) timeoutTimer.unref();

    this.runningSlots.set(runId, {
      taskId: 0,
      runId,
      startedAt: Date.now(),
      timeoutTimer,
      label,
    });

    logger.info(`[Direct] Slot registered for runId=${runId} (${label})`, {
      event: LOG_EVENTS.SCHEDULER_SLOT_REGISTERED,
      runId,
      label,
      slotsUsed: this.runningSlots.size,
      slotsLimit: CONCURRENCY_LIMIT,
    }, LOG_CONTEXTS.EXECUTION);
  }

  drainDirectQueue(): void {
    while (this.directQueue.length > 0 && this.runningSlots.size < CONCURRENCY_LIMIT) {
      const next = this.directQueue.shift()!;
      if (next.timeoutTimer) clearTimeout(next.timeoutTimer);

      const placeholderRunId = this.nextPlaceholderRunId();
      const placeholderTimer = this.createPlaceholderTimer(placeholderRunId, next.label);

      this.runningSlots.set(placeholderRunId, {
        taskId: 0,
        runId: placeholderRunId,
        startedAt: Date.now(),
        timeoutTimer: placeholderTimer,
        label: `placeholder:${next.label}`,
      });

      logger.debug(`[Direct] Draining queue: slot pre-allocated (placeholder=${placeholderRunId}) for ${next.label} (waited ${Date.now() - next.enqueuedAt}ms)`, {
        event: LOG_EVENTS.SCHEDULER_SLOT_REGISTERED,
        label: next.label,
        placeholderRunId,
        directQueueDepth: this.directQueue.length,
        slotsUsed: this.runningSlots.size,
      }, LOG_CONTEXTS.EXECUTION);

      next.resolve(placeholderRunId);
    }
  }

  releaseSlotByRunId(runId: number, source: 'callback' | 'db_reconcile' | 'db_missing' = 'callback'): void {
    const slot = this.runningSlots.get(runId);
    if (!slot || runId < 0) return;

    clearTimeout(slot.timeoutTimer);
    this.runningSlots.delete(runId);

    logger.info(`[P1] Slot released for runId=${runId} (taskId=${slot.taskId}) via ${source}`, {
      event: LOG_EVENTS.SCHEDULER_SLOT_RELEASED,
      runId,
      taskId: slot.taskId,
      source,
      heldMs: Date.now() - slot.startedAt,
    }, LOG_CONTEXTS.EXECUTION);

    this.drainDirectQueue();
    this.drainScheduledQueue();
  }

  private nextPlaceholderRunId(): number {
    this.placeholderRunIdCounter -= 1;
    return this.placeholderRunIdCounter;
  }

  private createPlaceholderTimer(placeholderRunId: number, label: string): NodeJS.Timeout {
    const placeholderTimer = setTimeout(() => {
      if (this.runningSlots.has(placeholderRunId)) {
        this.runningSlots.delete(placeholderRunId);
        logger.warn(`[Direct] Placeholder slot ${placeholderRunId} for ${label} expired, releasing`, {
          event: LOG_EVENTS.SCHEDULER_SLOT_TIMEOUT,
          label,
        }, LOG_CONTEXTS.EXECUTION);
        this.drainDirectQueue();
        this.drainScheduledQueue();
      }
    }, 30_000);

    if (placeholderTimer.unref) placeholderTimer.unref();
    return placeholderTimer;
  }
}
