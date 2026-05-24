/**
 * TaskSchedulerService - 任务定时调度引擎
 *
 * 1. 启动时加载所有 scheduled + active 任务，注册 Cron 定时器
 * 2. 支持动态添加/移除/更新任务调度
 * 3. 服务启动恢复：检测漏触发（上次执行时间 + cron 下次执行时间 < now），进行补偿执行
 * 4. 并发上限（CONCURRENCY_LIMIT）：超限时将任务放入等待队列
 * 5. 失败重试：支持 maxRetries / retryDelayMs 配置
 * 6. [P1] 并发槽位以 runId 为维度，槽位在 Jenkins 回调或执行超时后释放
 * 7. [P1] 等待队列支持优先级、入队时间、最大深度和队列超时机制
 * 依赖：croner（零依赖、原生 TS 支持的 cron 解析库）
 */
import { query, queryOne, getPool } from '../../config/database';
import logger from '../../utils/logger';
import { LOG_CONTEXTS, LOG_EVENTS } from '../../config/logging';
import { jenkinsService, JenkinsErrorCategory, isJenkinsErrorRetryable } from '../JenkinsService';
import { executionService } from '../ExecutionService';
import { AppDataSource } from '../../config/database';
import { TestCase } from '../../entities/TestCase';
import { In } from 'typeorm';
import { buildJenkinsTriggerFailureDiagnostic } from '../../utils/jenkinsTriggerDiagnostics';
import { persistJenkinsTriggerFailureDiagnostic } from '../../utils/jenkinsTriggerDiagnosticArtifact';
import { warnIfCallbackUrlIsLocal } from './callbackUrl';
import {
  CONCURRENCY_LIMIT,
  MAX_MISSED_WINDOW_MS,
  MAX_QUEUE_DEPTH,
  PRIORITY_MANUAL,
  PRIORITY_RETRY,
  PRIORITY_SCHEDULED,
  QUEUE_ITEM_TIMEOUT_MS,
  SCHEDULED_QUEUE_ITEM_TIMEOUT_MS,
  SCHEDULER_USER_ID,
  SLOT_HOLD_TIMEOUT_MS,
  SLOT_RECONCILE_INTERVAL_MS,
} from './config';
import { getNextCronTime } from './cron';
import {
  loadAllScheduledTasks,
  loadLastRunAt,
  loadScheduledTaskById,
  loadScheduledTaskPollRows,
  mapPollRowToScheduledTask,
} from './taskQueries';
import { TaskSchedulerRegistryHelper } from './registry';
import {
  getQueueItemTimeoutMs,
  isDuplicateQueuedDispatch,
} from './queuePolicy';
import { TaskSchedulerDirectQueueController } from './directQueueController';
import { isDuplicateScheduledWindow } from './scheduledWindowDedupe';
import { buildSchedulerStatus, type TaskSchedulerStatusSnapshot } from './status';
import type {
  DirectQueueItem,
  QueueItem,
  RetryState,
  RunningSlot,
  ScheduledTask,
} from './types';

export class TaskSchedulerService {
  private readonly registryHelper: TaskSchedulerRegistryHelper;
  private readonly directQueueController: TaskSchedulerDirectQueueController;

  /** taskId → setInterval / setTimeout handle */
  private timers: Map<number, NodeJS.Timeout> = new Map();

  /**
   * [P1] 当前运行中的槽位，key 为 runId（替代原来的 taskId Set）
   * 槽位在 Jenkins 回调或超时后才释放
   */
  private runningSlots: Map<number, RunningSlot> = new Map();

  /**
   * [P1] 等待执行的优先级队列（替代原来的 number[]）
   * 按 priority ASC, enqueuedAt ASC 排序
   */
  private waitQueue: QueueItem[] = [];

  /**
   * 直连等待队列（run-case / run-batch 专用）
   * FIFO，与 waitQueue 共享 runningSlots 并发上限
   */
  private directQueue: DirectQueueItem[] = [];

  /** 重试状态 */
  private retryStates: Map<number, RetryState> = new Map();

  /** 内存中缓存的任务配置 */
  private taskCache: Map<number, ScheduledTask> = new Map();

  /**
   * 最近已触发的 cron 窗口（taskId -> windowStartMs set）
   * 用于防止“补偿触发 + 正常定时触发”在同一窗口内重复创建运行记录。
   */
  private recentScheduledWindowsByTaskId: Map<number, Set<number>> = new Map();

  /** 是否已启动 */
  private started = false;


  /** 周期轮询 DB 同步任务变更的定时器 */
  private taskPollTimer?: NodeJS.Timeout;

  /** [P1] 周期对账 runningSlots 与 DB 终态的定时器 */
  private slotReconcileTimer?: NodeJS.Timeout;

  /** [P1] 避免并发执行多次槽位对账 */
  private slotReconcileInFlight = false;

  constructor() {
    this.directQueueController = new TaskSchedulerDirectQueueController({
      runningSlots: this.runningSlots,
      directQueue: this.directQueue,
      drainScheduledQueue: () => this.drainQueue(),
    });

    this.registryHelper = new TaskSchedulerRegistryHelper({
      taskCache: this.taskCache,
      timers: this.timers,
      dispatchTask: (taskId, triggerReason, operatorId, scheduledFor) => this.dispatchTask(taskId, triggerReason, operatorId, scheduledFor),
      recordAuditLog: (taskId, action, operatorId, metadata) => this.recordAuditLog(taskId, action, operatorId, metadata),
      unregisterTask: (taskId) => this.unregisterTask(taskId),
    });
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /**
   * 启动调度引擎
   * 1. 从 DB 加载所有 active scheduled 任务
   * 2. 对每个任务做漏触发检测，若漏触发则立即补偿执行
   * 3. 注册定时轮询（每分钟检查是否需要触发）
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn('TaskSchedulerService already started', { event: LOG_EVENTS.SCHEDULER_STARTED }, LOG_CONTEXTS.EXECUTION);
      return;
    }
    // 等待 TypeORM DataSource 初始化，避免在 DataSource 未就绪时访问 Repository 导致错误
    try {
      const MAX_WAIT_MS = 30_000;
      const POLL_MS = 500;
      let waited = 0;
      // AppDataSource may be imported lazily; check its isInitialized flag
      while (!(AppDataSource && (AppDataSource as any).isInitialized) && waited < MAX_WAIT_MS) {
        logger.debug('Waiting for AppDataSource to initialize before starting TaskSchedulerService', { waitedMs: waited }, LOG_CONTEXTS.EXECUTION);
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
        waited += POLL_MS;
      }
      if (!(AppDataSource && (AppDataSource as any).isInitialized)) {
        logger.warn('AppDataSource not initialized after wait; proceeding may cause repository errors', { waitedMs: waited }, LOG_CONTEXTS.EXECUTION);
      }
    } catch (err) {
      logger.warn('Error while waiting for AppDataSource initialization', { error: err instanceof Error ? err.message : String(err) }, LOG_CONTEXTS.EXECUTION);
    }
    this.started = true;
    logger.info('TaskSchedulerService starting...', { event: LOG_EVENTS.SCHEDULER_STARTED }, LOG_CONTEXTS.EXECUTION);

    // [dev-11] 服务启动时从数据库恢复"运行中"的槽位
    // 解决：服务重启或部署后，之前已触发但未回调完成的任务无法在调度器中看到
    try {
      await this.recoverRunningSlots();
    } catch (err) {
      logger.errorLog(err, '[dev-11] Failed to recover running slots on startup', { event: LOG_EVENTS.SCHEDULER_SLOT_RECOVERED });
    }

    try {
      await this.loadAndRegisterAllTasks();
    } catch (err) {
      logger.errorLog(err, 'Failed to load tasks on startup', { event: LOG_EVENTS.SCHEDULER_STARTED });
    }

    // 每 60 秒轮询一次，检查是否有新 scheduled 任务或任务更新
    this.taskPollTimer = setInterval(() => this.pollTaskChanges(), 60 * 1000);
    if (this.taskPollTimer.unref) this.taskPollTimer.unref();

    // [P1] 每隔几秒对账一次：若 DB 已终态但槽位仍占用，自动释放槽位
    this.slotReconcileTimer = setInterval(() => {
      void this.reconcileFinishedSlotsFromDb();
    }, SLOT_RECONCILE_INTERVAL_MS);
    if (this.slotReconcileTimer.unref) this.slotReconcileTimer.unref();

    logger.info('TaskSchedulerService started', {
      event: LOG_EVENTS.SCHEDULER_STARTED,
      concurrencyLimit: CONCURRENCY_LIMIT,
      queueItemTimeoutMs: QUEUE_ITEM_TIMEOUT_MS,
      scheduledQueueItemTimeoutMs: SCHEDULED_QUEUE_ITEM_TIMEOUT_MS,
      slotReconcileIntervalMs: SLOT_RECONCILE_INTERVAL_MS,
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * [dev-11] 服务启动时从数据库恢复运行中的槽位
   * 将 DB 中 status=running 的记录重新注册进 runningSlots
   * 这样即使服务重启，调度器也能感知到当前有多少个任务在跑，不会超并发
   * 注意：使用原生 query 而非 TypeORM，避免 AppDataSource 尚未初始化的竞态问题
   */
  private async recoverRunningSlots(): Promise<void> {
    const activeRuns = await query<Array<{ id: number; taskId: number | null; startTime: string | null }>>(
      `SELECT r.id, e.task_id AS taskId, r.start_time AS startTime
       FROM Auto_TestRun r
       LEFT JOIN Auto_TestCaseTaskExecutions e ON r.execution_id = e.id
       WHERE r.status = 'running'
         AND r.start_time > DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY r.start_time ASC`,
      []
    );

    if (activeRuns.length === 0) {
      logger.info('[dev-11] No running slots to recover on startup', { event: LOG_EVENTS.SCHEDULER_SLOT_RECOVERED }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    let recovered = 0;
    for (const run of activeRuns) {
      const runId = run.id;
      const taskId = run.taskId ?? 0;
      const startedAt = run.startTime ? new Date(run.startTime).getTime() : Date.now();
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(SLOT_HOLD_TIMEOUT_MS - elapsedMs, 30_000); // 至少保留 30 秒

      // 设置剩余超时（防止服务重启后槽位永远不释放）
      const timeoutTimer = setTimeout(() => {
        const slot = this.runningSlots.get(runId);
        if (slot) {
          this.runningSlots.delete(runId);
          logger.warn(`[dev-11] Recovered slot for runId=${runId} auto-released after timeout`, {
            event: LOG_EVENTS.SCHEDULER_SLOT_TIMEOUT,
            runId,
            taskId,
          }, LOG_CONTEXTS.EXECUTION);
          this.drainDirectQueue();
          this.drainQueue();
        }
      }, remainingMs);

      if (timeoutTimer.unref) timeoutTimer.unref();

      this.runningSlots.set(runId, {
        taskId,
        runId,
        startedAt,
        timeoutTimer,
        label: `recovered:${runId}`,
      });
      recovered++;
    }

    logger.info(`[dev-11] Recovered ${recovered} running slot(s) from database on startup`, {
      event: LOG_EVENTS.SCHEDULER_SLOT_RECOVERED,
      recovered,
      runIds: activeRuns.map(r => r.id),
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * [P1] 定时对账槽位状态：若 DB 中执行已终态，则主动释放内存槽位
   * 兜底场景：回调缺失 / 回调处理失败 / 手动同步导致槽位遗留
   */
  private async reconcileFinishedSlotsFromDb(): Promise<void> {
    if (this.slotReconcileInFlight || this.runningSlots.size === 0) return;

    this.slotReconcileInFlight = true;
    try {
      // 只对账真实 runId（正数），跳过占位 runId（负数）
      // 注意：不能提前 return，否则跳过 finally 块导致 slotReconcileInFlight 永久为 true
      const runIds = Array.from(this.runningSlots.keys()).filter(id => id > 0);

      if (runIds.length > 0) {
        const placeholders = runIds.map(() => '?').join(',');

        const rows = await query<Array<{ id: number; status: string }>>(
          `SELECT id, status FROM Auto_TestRun WHERE id IN (${placeholders})`,
          runIds,
        );

        const activeStatuses = new Set(['pending', 'running']);
        const statusByRunId = new Map(rows.map(row => [row.id, row.status]));

        let releasedCount = 0;
        for (const runId of runIds) {
          const status = statusByRunId.get(runId);
          if (!status || !activeStatuses.has(status)) {
            this.releaseSlotByRunId(runId, status ? 'db_reconcile' : 'db_missing');
            releasedCount++;
          }
        }

        if (releasedCount > 0) {
          logger.info(`[P1] Reconciled and released ${releasedCount} stale slot(s)`, {
            event: LOG_EVENTS.SCHEDULER_SLOT_RECONCILED,
            scannedRunIds: runIds,
            releasedCount,
          }, LOG_CONTEXTS.EXECUTION);
        }
      }
    } catch (err) {
      logger.warn('[P1] Failed to reconcile running slots with DB status', {
        event: LOG_EVENTS.SCHEDULER_SLOT_RECONCILED,
        error: err instanceof Error ? err.message : String(err),
        runningSlotCount: this.runningSlots.size,
      }, LOG_CONTEXTS.EXECUTION);
    } finally {
      this.slotReconcileInFlight = false;
    }
  }

  /** 停止所有定时器，清理资源 */
  stop(): void {
    for (const [taskId, timer] of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(taskId);
    }

    if (this.taskPollTimer) {
      clearInterval(this.taskPollTimer);
      this.taskPollTimer = undefined;
    }

    if (this.slotReconcileTimer) {
      clearInterval(this.slotReconcileTimer);
      this.slotReconcileTimer = undefined;
    }

    this.slotReconcileInFlight = false;

    for (const [, state] of this.retryStates) {
      if (state.timer) clearTimeout(state.timer);
    }
    // [P1] 清理运行中槽位的超时 timer
    for (const [, slot] of this.runningSlots) {
      clearTimeout(slot.timeoutTimer);
    }
    // [P1] 清理队列项的超时 timer
    for (const item of this.waitQueue) {
      if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
    }
    // 清理直连队列，拒绝所有等待中的请求
    for (const item of this.directQueue) {
      if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
      item.reject(new Error('Scheduler stopped'));
    }
    this.retryStates.clear();
    this.taskCache.clear();
    this.runningSlots.clear();
    this.waitQueue = [];
    this.directQueue = [];
    this.started = false;
    logger.info('TaskSchedulerService stopped', { event: LOG_EVENTS.SCHEDULER_STOPPED }, LOG_CONTEXTS.EXECUTION);
  }

  // ─────────────────────────────────────────────
  // 动态任务管理（供 tasks 路由调用）
  // ─────────────────────────────────────────────

  /** 添加或更新单个任务的调度（任务创建/更新时调用） */
  async registerTask(taskId: number): Promise<void> {
    const task = await this.registryHelper.loadTaskFromDb(taskId);
    if (!task) return;
    this.unregisterTask(taskId);
    if (task.status === 'active' && task.cronExpression) {
      this.taskCache.set(task.id, task);
      this.registryHelper.scheduleTask(task);
    }
  }

  /** 移除单个任务的调度（任务删除/归档时调用） */
  unregisterTask(taskId: number): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(taskId);
    }
    this.taskCache.delete(taskId);
    this.recentScheduledWindowsByTaskId.delete(taskId);
    // [P1] 从等待队列中也清除，并取消队列超时 timer
    const removedItems = this.waitQueue.filter(item => item.taskId === taskId);
    for (const item of removedItems) {
      if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
    }
    this.waitQueue = this.waitQueue.filter(item => item.taskId !== taskId);
    logger.debug(`Task ${taskId} unregistered from scheduler`, { event: LOG_EVENTS.SCHEDULER_TASK_UNREGISTERED, taskId }, LOG_CONTEXTS.EXECUTION);
  }

  getStatus(): TaskSchedulerStatusSnapshot {
    return buildSchedulerStatus({
      runningSlots: this.runningSlots,
      waitQueue: this.waitQueue,
      directQueue: this.directQueue,
      taskCache: this.taskCache,
    });
  }
  getQueuePosition(taskId: number): number {
    const idx = this.waitQueue.findIndex(item => item.taskId === taskId);
    return idx === -1 ? 0 : idx + 1;
  }

  enqueueDirectJob(label: string, job: (placeholderRunId: number) => Promise<void>): void {
    this.directQueueController.enqueueDirectJob(label, job);
  }

  async acquireDirectSlot(label: string): Promise<void> {
    return this.directQueueController.acquireDirectSlot(label);
  }

  registerDirectSlot(runId: number, label: string, placeholderRunId?: number): void {
    this.directQueueController.registerDirectSlot(runId, label, placeholderRunId);
  }

  private drainDirectQueue(): void {
    this.directQueueController.drainDirectQueue();
  }

  releaseSlotByRunId(runId: number, source: 'callback' | 'db_reconcile' | 'db_missing' = 'callback'): void {
    this.directQueueController.releaseSlotByRunId(runId, source);
  }
  private async loadAndRegisterAllTasks(): Promise<void> {
    await this.registryHelper.loadAndRegisterAllTasks();
  }

  private async loadTaskFromDb(taskId: number): Promise<ScheduledTask | null> {
    return this.registryHelper.loadTaskFromDb(taskId);
  }

  /**
   * 漏触发补偿
   *
   * 判断逻辑（基于 croner 精确推算，不再依赖近似间隔）：
   * 1. 从 lastRunAt 开始，用 croner 计算上一次「应该」触发的时间点（prevShouldRun）
   * 2. 若 prevShouldRun > lastRunAt，说明在 lastRunAt 之后、now 之前有一次漏触发
   * 3. 同时要求漏触发时间在 MAX_MISSED_WINDOW_MS（24h）内，避免长时间停机后批量补偿
   */
  private async compensateMissedFires(task: ScheduledTask): Promise<void> {
    await this.registryHelper.compensateMissedFires(task);
  }

  /**
   * 注册下一次触发定时器
   * 注意：调用前会自动清除同一任务的旧 timer，防止重复注册导致多次触发
   */
  private scheduleTask(task: ScheduledTask): void {
    this.registryHelper.scheduleTask(task);
  }

  // ─────────────────────────────────────────────
  // 内部：并发调度与执行
  // ─────────────────────────────────────────────

  /**
   * [P1 重写] 分发任务执行
   *
   * 核心变化：
   * 1. 并发检查基于 runningSlots.size（runId 维度），而非 runningTasks
   * 2. 超过并发上限时，放入优先级队列（而非简单数组）
   * 3. 槽位在 executeTask 返回后**不立即释放**，而是在 Jenkins 回调/超时后释放
   * 4. 队列最大深度保护（MAX_QUEUE_DEPTH）+ 队列项超时（QUEUE_ITEM_TIMEOUT_MS）
   */
  async dispatchTask(
    taskId: number,
    triggerReason: 'scheduled' | 'manual' | 'retry' = 'scheduled',
    operatorId?: number,
    scheduledFor?: Date,
  ): Promise<void> {
    if (this.runningSlots.size >= CONCURRENCY_LIMIT) {
      // [P1] 队列深度保护
      if (this.waitQueue.length >= MAX_QUEUE_DEPTH) {
        logger.warn(`Task ${taskId} dropped: queue full (depth=${this.waitQueue.length}/${MAX_QUEUE_DEPTH})`, {
          event: LOG_EVENTS.SCHEDULER_TASK_QUEUE_FULL,
          taskId,
          queueDepth: this.waitQueue.length,
          maxQueueDepth: MAX_QUEUE_DEPTH,
        }, LOG_CONTEXTS.EXECUTION);
        return;
      }

      const candidateQueueItem = {
        taskId,
        triggerReason,
        scheduledFor,
      };

      // [P1] 同一调度窗口已在队列中则跳过；不同 cron 窗口需要保留，避免周期触发被吞掉。
      if (this.waitQueue.some(item => isDuplicateQueuedDispatch(item, candidateQueueItem))) {
        logger.debug(`Task ${taskId} already in queue, skipping duplicate enqueue`, {
          event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
          taskId,
          triggerReason,
          scheduledFor: scheduledFor?.toISOString() ?? null,
        }, LOG_CONTEXTS.EXECUTION);
        return;
      }

      // [P1] 计算优先级
      const priority = triggerReason === 'manual' ? PRIORITY_MANUAL
        : triggerReason === 'retry' ? PRIORITY_RETRY
        : PRIORITY_SCHEDULED;

      const queueItem: QueueItem = {
        taskId,
        triggerReason,
        operatorId,
        scheduledFor,
        enqueuedAt: Date.now(),
        priority,
      };

      const queueTimeoutMs = getQueueItemTimeoutMs(triggerReason);

      // [P1] 队列项超时：scheduled 使用更长等待，避免周期触发在槽位释放前被丢弃
      queueItem.timeoutTimer = setTimeout(() => {
        const idx = this.waitQueue.findIndex(it => it === queueItem);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
          logger.warn(`Task ${taskId} queue item timed out and removed (waited ${queueTimeoutMs}ms)`, {
            event: LOG_EVENTS.SCHEDULER_TASK_QUEUE_TIMEOUT,
            taskId,
            waitMs: Date.now() - queueItem.enqueuedAt,
            triggerReason,
            scheduledFor: scheduledFor?.toISOString() ?? null,
          }, LOG_CONTEXTS.EXECUTION);
        }
      }, queueTimeoutMs);
      if (queueItem.timeoutTimer.unref) queueItem.timeoutTimer.unref();

      // [P1] 按优先级插入（稳定排序：priority ASC，enqueuedAt ASC）
      const insertIdx = this.waitQueue.findIndex(
        item => item.priority > priority || (item.priority === priority && item.enqueuedAt > queueItem.enqueuedAt)
      );
      if (insertIdx === -1) {
        this.waitQueue.push(queueItem);
      } else {
        this.waitQueue.splice(insertIdx, 0, queueItem);
      }

      logger.info(`Task ${taskId} queued (concurrency limit ${CONCURRENCY_LIMIT} reached)`, {
        event: LOG_EVENTS.SCHEDULER_TASK_QUEUED,
        taskId,
        triggerReason,
        priority,
        queuePosition: this.waitQueue.findIndex(it => it === queueItem) + 1,
        queueDepth: this.waitQueue.length,
        queueTimeoutMs,
        scheduledFor: scheduledFor?.toISOString() ?? null,
      }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    logger.info(`Task ${taskId} dispatching (reason=${triggerReason})`, {
      event: LOG_EVENTS.SCHEDULER_TASK_DISPATCHED,
      taskId,
      triggerReason,
      runningSlots: this.runningSlots.size,
      limit: CONCURRENCY_LIMIT,
      scheduledFor: scheduledFor?.toISOString() ?? null,
    }, LOG_CONTEXTS.EXECUTION);

    try {
      // [P1] executeTask 内部会在 Jenkins 触发成功后注册 slot，失败时不注册（不占用槽位）
      await this.executeTask(taskId, triggerReason, operatorId, scheduledFor);
      // 触发成功后清理历史重试状态，避免后续误判
      this.clearRetryState(taskId);
    } catch (err) {
      logger.errorLog(err, `Task ${taskId} execution error`, { event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED, taskId });
      await this.handleTaskFailure(taskId, err);
      // 执行失败时，槽位已在 executeTask 中注册（若注册了则由超时 timer 释放）
      // 这里补充一次 drainQueue，确保失败不阻塞后续任务
      this.drainQueue();
    }
    // 注意：不再在 finally 中释放槽位！槽位由 releaseSlotByRunId 或超时 timer 负责释放
  }

  /**
   * 实际执行任务：创建运行记录 + 触发 Jenkins
   */
  private async executeTask(taskId: number, triggerReason: string, operatorId?: number, scheduledFor?: Date): Promise<void> {
    // 从 DB 重新读取任务配置（确保最新）
    const row = await queryOne<{
      id: number; name: string; case_ids: string; project_id: number;
      status: string; cron_expression: string; environment_id: number | null;
      max_retries: number | null; retry_delay_ms: number | null;
    }>(
      `SELECT id, name, case_ids, project_id, status, cron_expression, environment_id, max_retries, retry_delay_ms
       FROM Auto_TestCaseTasks WHERE id = ?`,
      [taskId]
    );

    if (!row || row.status !== 'active') {
      logger.info(`Task ${taskId} skipped (status=${row?.status ?? 'not found'})`, { event: LOG_EVENTS.SCHEDULER_TASK_SKIPPED, taskId }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    const traceId = `scheduler_${taskId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    let caseIds: number[] = [];
    try { caseIds = JSON.parse(row.case_ids || '[]'); } catch { /* ignore */ }

    if (triggerReason === 'scheduled') {
      const dedupe = await isDuplicateScheduledWindow({
        taskId,
        cronExpression: row.cron_expression,
        scheduledFor,
        recentScheduledWindowsByTaskId: this.recentScheduledWindowsByTaskId,
      });
      if (dedupe.duplicated) {
        logger.warn(`Task ${taskId} duplicate scheduled trigger skipped`, {
          event: LOG_EVENTS.SCHEDULER_TASK_DUPLICATE_SKIPPED,
          taskId,
          cronExpression: row.cron_expression,
          triggerReason,
          traceId,
          dedupeReason: dedupe.reason,
          windowStart: dedupe.windowStart?.toISOString() ?? null,
          scheduledFor: scheduledFor?.toISOString() ?? null,
        }, LOG_CONTEXTS.EXECUTION);
        await this.recordAuditLog(taskId, 'duplicate_scheduled_skipped', SCHEDULER_USER_ID, {
          triggerReason,
          traceId,
          dedupeReason: dedupe.reason,
          windowStart: dedupe.windowStart?.toISOString() ?? null,
          scheduledFor: scheduledFor?.toISOString() ?? null,
        });
        return;
      }
    }

    if (caseIds.length === 0) {
      logger.warn(`Task ${taskId} has no caseIds, skipping`, { event: LOG_EVENTS.SCHEDULER_TASK_SKIPPED, taskId }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    // 获取脚本路径（在创建运行记录前校验，避免产生无法执行的 pending 记录堆积）
    const cases = await AppDataSource.getRepository(TestCase).find({
      where: { id: In(caseIds), enabled: true },
      select: ['id', 'scriptPath'],
    });
    const scriptPaths = [...new Set(cases.map(c => c.scriptPath?.trim()).filter(Boolean))] as string[];

    if (scriptPaths.length === 0) {
      // 用例均无脚本路径，无法触发 Jenkins，跳过本次执行
      // 注意：此处故意不创建运行记录，避免每次定时触发都堆积 pending 状态的无效记录
      logger.warn(`Task ${taskId} has no script paths (all caseIds have empty scriptPath), skipping execution`, {
        event: LOG_EVENTS.SCHEDULER_TASK_SKIPPED,
        taskId,
        caseIds,
        triggerReason,
        traceId,
        scheduledFor: scheduledFor?.toISOString() ?? null,
      }, LOG_CONTEXTS.EXECUTION);
      // ⚠️ Bug Fix: 即使跳过执行，也必须更新内存中的 lastRunAt
      // 否则 compensateMissedFires 每次都会误判为"漏触发"并额外再 dispatch 一次，
      // 导致每个 cron 周期产生 2 条记录（补偿 + 正常），记录不断堆积
      const cachedTask = this.taskCache.get(taskId);
      if (cachedTask) {
        cachedTask.lastRunAt = scheduledFor ?? new Date();
      }
      return;
    }

    // 更新缓存（放在 scriptPaths 校验之后，只有真正要执行时才刷新 lastRunAt）
    const updatedCache: ScheduledTask = {
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      caseIds,
      projectId: row.project_id || 1,
      environmentId: row.environment_id ?? undefined,
      status: row.status as 'active',
      maxRetries: row.max_retries ?? 1,
      retryDelayMs: row.retry_delay_ms ?? 30_000,
      lastRunAt: scheduledFor ?? new Date(),
    };
    this.taskCache.set(taskId, updatedCache);

    // 如果 Jenkins 未配置（dev 本地运行常见情况），则跳过真正触发并记录审计，避免创建会立即失败的运行记录
    try {
      if (!jenkinsService.isEnabled()) {
        logger.warn(`Jenkins integration not configured, skipping run creation for task ${taskId}`, {
          event: LOG_EVENTS.SCHEDULER_TASK_SKIPPED,
          taskId,
          triggerReason,
          traceId,
          scheduledFor: scheduledFor?.toISOString() ?? null,
        }, LOG_CONTEXTS.EXECUTION);

        await this.recordAuditLog(taskId, 'skipped', SCHEDULER_USER_ID, {
          reason: 'jenkins_not_configured',
          triggerReason,
          traceId,
          caseCount: caseIds.length,
          scheduledFor: scheduledFor?.toISOString() ?? null,
        });

        return;
      }
    } catch (err) {
      // 若 jenkinsService 未暴露 isEnabled 或检查失败，不阻塞执行，继续原流程
      logger.debug('jenkinsService.isEnabled check failed or unavailable, proceeding with trigger', { error: err instanceof Error ? err.message : String(err) }, LOG_CONTEXTS.EXECUTION);
    }

    const callbackBase = ((process.env.API_CALLBACK_URL ?? '').trim() || 'http://localhost:3000').replace(/\/+$/, '');
    const callbackUrl = callbackBase.endsWith('/api/jenkins/callback')
      ? callbackBase
      : `${callbackBase}/api/jenkins/callback`;
    warnIfCallbackUrlIsLocal(callbackUrl, traceId);

    // 1. 创建运行记录
    // triggerReason 为 'manual' 时使用 'manual'，其余（'scheduled'/'retry'）使用 'schedule'
    const resolvedTriggerType: 'manual' | 'jenkins' | 'schedule' =
      triggerReason === 'manual' ? 'manual' : 'schedule';
    // 手动触发时使用实际操作者ID；调度/重试时使用系统用户
    const resolvedTriggeredBy = (triggerReason === 'manual' && operatorId != null)
      ? operatorId
      : SCHEDULER_USER_ID;

    const execution = await executionService.triggerTestExecution({
      caseIds,
      projectId: row.project_id || 1,
      triggeredBy: resolvedTriggeredBy,
      triggerType: resolvedTriggerType,
      taskId,
      taskName: row.name,
    });

    logger.info(`Task ${taskId} execution created (runId=${execution.runId}, execId=${execution.executionId})`, {
      event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_CREATED,
      taskId,
      runId: execution.runId,
      executionId: execution.executionId,
      triggerReason,
      traceId,
      cronExpression: row.cron_expression,
      scheduledFor: scheduledFor?.toISOString() ?? null,
    }, LOG_CONTEXTS.EXECUTION);

    // 记录审计日志：手动触发时使用实际操作者 ID，调度/重试时使用系统用户
    const auditOperatorId = (triggerReason === 'manual' && operatorId != null)
      ? operatorId
      : SCHEDULER_USER_ID;
    await this.recordAuditLog(taskId, 'triggered', auditOperatorId, {
      triggerReason,
      runId: execution.runId,
      executionId: execution.executionId,
      caseCount: caseIds.length,
      traceId,
      cronExpression: row.cron_expression,
      scheduledFor: scheduledFor?.toISOString() ?? null,
      source: triggerReason === 'manual' ? 'manual_api' : triggerReason === 'retry' ? 'retry_timer' : 'scheduler',
    });

    // 2. 触发 Jenkins
    try {
      const capturedRunId = execution.runId;
      // [dev-10] 传入 onBuildResolved 回调，当 Jenkins 分配真实 buildNumber 后异步更新数据库
      const triggerResult = await jenkinsService.triggerBatchJob(
        execution.runId,
        caseIds,
        scriptPaths,
        callbackUrl,
        async (buildNumber: number, buildUrl: string) => {
          const buildId = String(buildNumber);
          logger.debug(`[dev-10] Task ${taskId} build resolved via queueId poll`, {
            event: LOG_EVENTS.SCHEDULER_JENKINS_BUILD_RESOLVED,
            taskId,
            runId: capturedRunId,
            buildId,
            buildUrl,
            traceId,
          }, LOG_CONTEXTS.EXECUTION);
          await executionService.updateBatchJenkinsInfo(capturedRunId, { buildId, buildUrl });
          this.scheduleJenkinsFallbackSync(capturedRunId, taskId, traceId);
        },
        async (reason: 'cancelled' | 'timeout') => {
          // [dev-11] Jenkins 队列取消/超时，主动将平台执行状态更新为 aborted 并释放槽位
          logger.warn(`[dev-11] Task ${taskId} Jenkins queue ${reason}, marking execution as aborted`, {
            event: LOG_EVENTS.SCHEDULER_JENKINS_QUEUE_ABORTED,
            taskId,
            runId: capturedRunId,
            reason,
            traceId,
          }, LOG_CONTEXTS.EXECUTION);
          try {
            await executionService.markExecutionAborted(capturedRunId, `Jenkins build ${reason}`);
          } catch (err) {
            logger.warn(`[dev-11] Failed to mark task execution as aborted`, {
              event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED,
              taskId,
              runId: capturedRunId,
              error: err instanceof Error ? err.message : String(err),
            }, LOG_CONTEXTS.EXECUTION);
          }
          this.releaseSlotByRunId(capturedRunId);
        }
      );

      if (triggerResult.success) {
        // [P1] Jenkins 触发成功后注册槽位，槽位持有直到回调或超时
        this.registerRunningSlot(taskId, execution.runId);
      } else {
        logger.warn(`Jenkins trigger failed for task ${taskId}`, {
          event: LOG_EVENTS.SCHEDULER_JENKINS_TRIGGER_FAILED,
          message: triggerResult.message,
          errorCategory: triggerResult.errorCategory,
        }, LOG_CONTEXTS.EXECUTION);
        // 抛出带分类信息的错误，供 handleTaskFailure 决定是否重试
        if (!isJenkinsErrorRetryable(triggerResult.errorCategory)) {
          const config = jenkinsService.getConfigInfo();
          const persisted = await persistJenkinsTriggerFailureDiagnostic(triggerResult, {
            runId: capturedRunId,
            source: 'scheduler',
            traceId,
            baseUrl: config?.baseUrl,
            jobName: config?.jobs.api,
            callbackUrl,
            caseIds,
            scriptPaths,
          }).catch(async (error: unknown) => {
            logger.warn('Failed to persist scheduled Jenkins trigger diagnostic artifact', {
              event: LOG_EVENTS.SCHEDULER_JENKINS_TRIGGER_FAILED,
              taskId,
              runId: capturedRunId,
              traceId,
              error: error instanceof Error ? error.message : String(error),
            }, LOG_CONTEXTS.EXECUTION);

            return {
              publicPath: undefined,
              diagnostic: buildJenkinsTriggerFailureDiagnostic(triggerResult, {
                baseUrl: config?.baseUrl,
                jobName: config?.jobs.api,
                callbackUrl,
                caseIds,
                scriptPaths,
              }),
            };
          });

          await executionService.recordTriggerFailureDiagnostics({
            runId: capturedRunId,
            caseIds,
            errorMessage: persisted.diagnostic.errorMessage,
            errorStack: persisted.diagnostic.errorStack,
            logPath: persisted.publicPath,
          });
          await executionService.markExecutionAborted(capturedRunId, persisted.diagnostic.abortReason);
        }
        const classifiedErr = new Error(`Jenkins trigger failed: ${triggerResult.message}`);
        (classifiedErr as Error & { _jenkinsErrorCategory: JenkinsErrorCategory })._jenkinsErrorCategory = triggerResult.errorCategory;
        throw classifiedErr;
      }
    } catch (jenkinsErr) {
      // Jenkins 失败，将该任务记入重试（不注册槽位，不占用并发名额）
      throw jenkinsErr;
    }
  }

  /**
   * [P1] 注册运行中槽位，并设置超时自动释放
   */
  private scheduleJenkinsFallbackSync(runId: number, taskId: number, traceId: string): void {
    const delayMs = parseInt(process.env.JENKINS_CALLBACK_FALLBACK_DELAY_MS || '30000', 10);
    const intervalMs = parseInt(process.env.JENKINS_CALLBACK_FALLBACK_INTERVAL_MS || '30000', 10);
    const maxAttempts = parseInt(process.env.JENKINS_CALLBACK_FALLBACK_ATTEMPTS || '10', 10);
    const terminalStatuses = new Set(['success', 'failed', 'aborted']);

    const syncOnce = async (attempt: number): Promise<void> => {
      try {
        const result = await executionService.syncExecutionStatusFromJenkins(runId);
        logger.info('[scheduler-fallback] Jenkins status sync attempted', {
          runId,
          taskId,
          traceId,
          attempt,
          maxAttempts,
          success: result.success,
          updated: result.updated,
          jenkinsStatus: result.jenkinsStatus,
          message: result.message,
        }, LOG_CONTEXTS.EXECUTION);

        if (result.jenkinsStatus && terminalStatuses.has(result.jenkinsStatus)) {
          this.releaseSlotByRunId(runId, 'db_reconcile');
          return;
        }
      } catch (error) {
        logger.warn('[scheduler-fallback] Jenkins status sync failed', {
          runId,
          taskId,
          traceId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        }, LOG_CONTEXTS.EXECUTION);
      }

      if (attempt < maxAttempts) {
        const retryTimer = setTimeout(() => {
          void syncOnce(attempt + 1);
        }, intervalMs);
        if (retryTimer.unref) retryTimer.unref();
      }
    };

    const timer = setTimeout(() => {
      void syncOnce(1);
    }, delayMs);
    if (timer.unref) timer.unref();
  }

  private registerRunningSlot(taskId: number, runId: number): void {
    // 超时自动释放槽位（防止 Jenkins 挂死或回调永远不来）
    const timeoutTimer = setTimeout(() => {
      const slot = this.runningSlots.get(runId);
      if (slot) {
        this.runningSlots.delete(runId);
        logger.warn(`[P1] Slot for runId=${runId} (taskId=${taskId}) auto-released after ${SLOT_HOLD_TIMEOUT_MS}ms timeout`, {
          event: LOG_EVENTS.SCHEDULER_SLOT_TIMEOUT,
          runId,
          taskId,
          heldMs: SLOT_HOLD_TIMEOUT_MS,
        }, LOG_CONTEXTS.EXECUTION);
        this.drainQueue();
      }
    }, SLOT_HOLD_TIMEOUT_MS);

    if (timeoutTimer.unref) timeoutTimer.unref();

    this.runningSlots.set(runId, {
      taskId,
      runId,
      startedAt: Date.now(),
      timeoutTimer,
    });

    logger.info(`[P1] Slot registered for runId=${runId} (taskId=${taskId})`, {
      event: LOG_EVENTS.SCHEDULER_SLOT_REGISTERED,
      runId,
      taskId,
      slotsUsed: this.runningSlots.size,
      slotsLimit: CONCURRENCY_LIMIT,
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * 清理任务重试状态（含定时器）
   */
  private clearRetryState(taskId: number): void {
    const state = this.retryStates.get(taskId);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    this.retryStates.delete(taskId);
  }

  /**
   * 失败重试处理
   *
   * 错误分类逻辑：
   * - 可重试错误（network/rate_limited/server_error）：按配置进行重试
   * - 不可重试错误（auth_failed/not_found/bad_request）：直接标记为永久失败，不浪费重试配额
   */
  private async handleTaskFailure(taskId: number, err: unknown): Promise<void> {
    const task = this.taskCache.get(taskId);
    if (!task) return;

    // 从 Error 对象中提取 Jenkins 错误分类
    let errorCategory: JenkinsErrorCategory | undefined;
    const errorObj = err instanceof Error ? err : new Error(String(err));
    if ('_jenkinsErrorCategory' in errorObj) {
      errorCategory = (errorObj as Error & { _jenkinsErrorCategory: JenkinsErrorCategory })._jenkinsErrorCategory;
    }

    // 如果是不可重试的错误，直接标记永久失败
    if (errorCategory && !isJenkinsErrorRetryable(errorCategory)) {
      logger.error(`Task ${taskId} permanently failed due to non-retryable error [${errorCategory}]: ${errorObj.message}`, {
        event: LOG_EVENTS.SCHEDULER_TASK_RETRY_EXHAUSTED,
        taskId,
        errorCategory,
        attempts: 0,
        error: errorObj.message,
      }, LOG_CONTEXTS.EXECUTION);

      await this.recordAuditLog(taskId, 'permanently_failed', SCHEDULER_USER_ID, {
        attempts: 0,
        error: errorObj.message,
        errorCategory,
        reason: `Non-retryable error: ${errorCategory}`,
      });

      this.clearRetryState(taskId);
      return;
    }

    let state = this.retryStates.get(taskId);
    if (!state) {
      state = {
        taskId,
        attempt: 0,
        maxRetries: task.maxRetries,
        retryDelayMs: task.retryDelayMs,
      };
      this.retryStates.set(taskId, state);
    }

    state.attempt++;

    if (state.attempt <= state.maxRetries) {
      const delay = state.retryDelayMs * state.attempt; // 指数退避
      logger.warn(`Task ${taskId} failed (attempt ${state.attempt}/${state.maxRetries}), retrying in ${delay}ms`, {
        event: LOG_EVENTS.SCHEDULER_TASK_RETRY,
        taskId,
        attempt: state.attempt,
        maxRetries: state.maxRetries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      }, LOG_CONTEXTS.EXECUTION);

      await this.recordAuditLog(taskId, 'retry_scheduled', SCHEDULER_USER_ID, {
        attempt: state.attempt,
        maxRetries: state.maxRetries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = undefined;
      }

      const retryTimer = setTimeout(async () => {
        // 注意：不要在重试前删除 retryState，否则 attempt 会被重置为 1，导致无限重试
        const latestState = this.retryStates.get(taskId);
        if (latestState) {
          latestState.timer = undefined;
        }
        await this.dispatchTask(taskId, 'retry').catch(retryErr => {
          logger.errorLog(retryErr, `Task ${taskId} retry dispatch failed`, { event: LOG_EVENTS.SCHEDULER_TASK_RETRY });
        });
      }, delay);

      if (retryTimer.unref) retryTimer.unref();
      state.timer = retryTimer;
    } else {
      logger.error(`Task ${taskId} permanently failed after ${state.maxRetries} retries`, {
        event: LOG_EVENTS.SCHEDULER_TASK_RETRY_EXHAUSTED,
        taskId,
        attempts: state.attempt,
        error: err instanceof Error ? err.message : String(err),
      }, LOG_CONTEXTS.EXECUTION);

      await this.recordAuditLog(taskId, 'permanently_failed', SCHEDULER_USER_ID, {
        attempts: state.attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      this.clearRetryState(taskId);
    }
  }

  /** [P1] 从优先级队列取出任务执行（按 priority ASC, enqueuedAt ASC 排序） */
  private drainQueue(): void {
    while (this.waitQueue.length > 0 && this.runningSlots.size < CONCURRENCY_LIMIT) {
      const next = this.waitQueue.shift()!;
      // 取消队列超时 timer（已出队，不再需要）
      if (next.timeoutTimer) clearTimeout(next.timeoutTimer);

      logger.debug(`Draining queue: dispatching task ${next.taskId} (priority=${next.priority}, waited=${Date.now() - next.enqueuedAt}ms)`, {
        event: LOG_EVENTS.SCHEDULER_TASK_DISPATCHED,
        taskId: next.taskId,
        triggerReason: next.triggerReason,
        queueDepth: this.waitQueue.length,
        scheduledFor: next.scheduledFor?.toISOString() ?? null,
      }, LOG_CONTEXTS.EXECUTION);

      this.dispatchTask(next.taskId, next.triggerReason, next.operatorId, next.scheduledFor).catch(err => {
        logger.errorLog(err, `Queue drain dispatch failed for task ${next.taskId}`, { event: LOG_EVENTS.SCHEDULER_TASK_EXECUTION_FAILED });
      });
    }
  }

  // ─────────────────────────────────────────────
  // 内部：定时轮询，同步 DB 变更
  // ─────────────────────────────────────────────

  private async pollTaskChanges(): Promise<void> {
    await this.registryHelper.pollTaskChanges();
  }

  // ─────────────────────────────────────────────
  // 内部：审计日志
  // ─────────────────────────────────────────────

  private async recordAuditLog(
    taskId: number,
    action: string,
    operatorId: number | null,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      const pool = getPool();
      await pool.execute(
        `INSERT INTO Auto_TaskAuditLogs (task_id, action, operator_id, metadata, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [taskId, action, operatorId, JSON.stringify(metadata)]
      );
    } catch {
      // 审计日志写入失败不应影响主流程，静默处理
    }
  }
}

export const taskSchedulerService = new TaskSchedulerService();
