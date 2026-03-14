/**
 * TaskSchedulerService - 任务定时调度引擎
 *
 * 功能：
 * 1. 启动时加载所有 scheduled + active 任务，注册 Cron 定时器
 * 2. 支持动态添加/移除/更新任务调度
 * 3. 服务启动恢复：检测漏触发（上次执行时间 + cron 间隔 < now），进行补偿执行
 * 4. 并发上限（CONCURRENCY_LIMIT）：超限时将任务放入等待队列
 * 5. 失败重试：支持 maxRetries / retryDelayMs 配置
 * 6. [P1] 并发槽位以 runId 为维度，槽位在 Jenkins 回调或执行超时后释放
 * 7. [P1] 等待队列支持优先级、入队时间、最大深度和队列超时机制
 */

import { query, queryOne, getPool } from '../config/database';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import { jenkinsService } from './JenkinsService';
import { executionService } from './ExecutionService';
import { AppDataSource } from '../config/database';
import { TestCase } from '../entities/TestCase';
import { In } from 'typeorm';
import { ExecutionRepository } from '../repositories/ExecutionRepository';

// ──────────────────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────────────────

export interface ScheduledTask {
  id: number;
  name: string;
  cronExpression: string;
  caseIds: number[];
  projectId: number;
  environmentId?: number;
  status: 'active' | 'paused' | 'archived';
  // 重试配置（存储在 DB，默认值由调度器提供）
  maxRetries: number;
  retryDelayMs: number;
  // 上次执行时间（UTC）
  lastRunAt: Date | null;
}

/**
 * 队列项（P1：替代原来的 number[]，携带完整调度元信息）
 */
export interface QueueItem {
  taskId: number;
  triggerReason: 'scheduled' | 'manual' | 'retry';
  operatorId?: number;
  /** 入队时间（ms） */
  enqueuedAt: number;
  /** 优先级（数字越小优先级越高），manual > scheduled > retry */
  priority: number;
  /** 队列超时 timer handle */
  timeoutTimer?: NodeJS.Timeout;
}

/**
 * 运行中槽位（P1：以 runId 为维度，替代原来的 taskId）
 * label：用于直连执行（run-case/run-batch），标识来源（如 "case:123" / "batch:123"）
 */
interface RunningSlot {
  /** taskId：任务调度时填写；直连执行时为 0 */
  taskId: number;
  runId: number;
  startedAt: number;
  /** 执行超时 timer handle */
  timeoutTimer: NodeJS.Timeout;
  /** 直连执行标签（如 "case:123" / "batch:5,6,7"），调度执行时为 undefined */
  label?: string;
}

/**
 * 直连等待队列项（run-case / run-batch 专用）
 * 与 QueueItem 分开，避免混入任务优先级队列
 */
interface DirectQueueItem {
  /** 入队时间（ms） */
  enqueuedAt: number;
  /** 标识来源（如 "case:123" / "batch:5,6,7"） */
  label: string;
  /** 队列超时 timer handle */
  timeoutTimer?: NodeJS.Timeout;
  /** resolve：槽位可用时通知等待方，传入占位 runId 供 job 替换 */
  resolve: (placeholderRunId: number) => void;
  /** reject：超时或队列满时通知等待方 */
  reject: (err: Error) => void;
}

interface RetryState {
  taskId: number;
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  timer?: NodeJS.Timeout;
}

// ──────────────────────────────────────────────────────────
// 内部常量
// ──────────────────────────────────────────────────────────

/** 全局最大并发执行任务数 */
const CONCURRENCY_LIMIT = parseInt(process.env.TASK_CONCURRENCY_LIMIT || '3', 10);

/** 系统自动操作时 operator_id 使用 0（调度引擎、补偿触发等） */
const SCHEDULER_USER_ID = 0;

/** 最大漏触发补偿窗口（毫秒），默认 24 小时 */
const MAX_MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;

/** [P1] 等待队列最大深度，超过后拒绝新入队（防止内存无限增长） */
const MAX_QUEUE_DEPTH = parseInt(process.env.TASK_MAX_QUEUE_DEPTH || '50', 10);

/** [P1] 队列项最长等待时间（毫秒），超时后自动从队列中移除，默认 10 分钟 */
const QUEUE_ITEM_TIMEOUT_MS = parseInt(process.env.TASK_QUEUE_TIMEOUT_MS || String(10 * 60 * 1000), 10);

/** [P1] 运行中槽位最长持有时间（毫秒），超时后强制释放，默认 30 分钟 */
const SLOT_HOLD_TIMEOUT_MS = parseInt(process.env.TASK_SLOT_TIMEOUT_MS || String(30 * 60 * 1000), 10);

/** [P1] 运行槽位与 DB 状态对账间隔（毫秒），默认 5 秒 */
const SLOT_RECONCILE_INTERVAL_MS = parseInt(process.env.TASK_SLOT_RECONCILE_INTERVAL_MS || '5000', 10);

/** [P1] 队列优先级：手动触发 > 定时触发 > 重试 */
const PRIORITY_MANUAL = 1;
const PRIORITY_SCHEDULED = 2;
const PRIORITY_RETRY = 3;

// ──────────────────────────────────────────────────────────
// Cron 工具函数（轻量级，无第三方依赖）
// ──────────────────────────────────────────────────────────

/**
 * 解析标准 5 段 cron 表达式，返回最小触发间隔（毫秒）
 * 注意：这里只做近似计算，用于漏触发检测
 * 格式：分 时 日 月 周
 */
function parseCronToIntervalMs(expr: string): number | null {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [min, hour] = parts;

    // 简单处理常见模式
    // */N 分钟: 返回 N * 60 * 1000
    if (/^\*\/(\d+)$/.test(min) && hour === '*') {
      const n = parseInt(min.replace('*/', ''));
      return n * 60 * 1000;
    }

    // 每小时（0 * * * *）
    if (min !== '*' && hour === '*') {
      return 60 * 60 * 1000;
    }

    // 每天（0 2 * * *）
    if (min !== '*' && /^\d+$/.test(hour)) {
      return 24 * 60 * 60 * 1000;
    }

    // 默认1小时
    return 60 * 60 * 1000;
  } catch {
    return null;
  }
}

/**
 * 根据 cron 表达式计算下次触发时间
 * 精简实现，支持常见的 5 段 cron（分 时 日 月 周）
 * 已导出，供路由层（cron/preview 接口）直接复用，避免重复实现
 */
export function getNextCronTime(expr: string, from: Date = new Date()): Date | null {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minPart, hourPart, domPart, monthPart, dowPart] = parts;

    const parseField = (field: string, max: number): number[] | null => {
      if (field === '*') return null; // means "any"
      if (/^\*\/(\d+)$/.test(field)) {
        const step = parseInt(field.replace('*/', ''));
        const result: number[] = [];
        for (let i = 0; i <= max; i += step) result.push(i);
        return result;
      }
      if (/^\d+(,\d+)*$/.test(field)) {
        return field.split(',').map(Number);
      }
      if (/^(\d+)-(\d+)$/.test(field)) {
        const [, a, b] = /^(\d+)-(\d+)$/.exec(field)!;
        const result: number[] = [];
        for (let i = parseInt(a); i <= parseInt(b); i++) result.push(i);
        return result;
      }
      if (/^\d+$/.test(field)) return [parseInt(field)];
      return null;
    };

    const allowedMins = parseField(minPart, 59);
    const allowedHours = parseField(hourPart, 23);
    const allowedDoms = parseField(domPart, 31);
    const allowedMonths = parseField(monthPart, 12);
    const allowedDows = parseField(dowPart, 6);

    // 从下一分钟开始查找
    const candidate = new Date(from.getTime() + 60 * 1000);
    candidate.setSeconds(0, 0);

    // 最多查找 400 天
    const maxSearch = new Date(from.getTime() + 400 * 24 * 60 * 60 * 1000);

    while (candidate < maxSearch) {
      // 检查月
      if (allowedMonths && !allowedMonths.includes(candidate.getMonth() + 1)) {
        candidate.setMonth(candidate.getMonth() + 1, 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
      // 检查日
      if (allowedDoms && !allowedDoms.includes(candidate.getDate())) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
      // 检查周几
      if (allowedDows && !allowedDows.includes(candidate.getDay())) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
      // 检查小时
      if (allowedHours && !allowedHours.includes(candidate.getHours())) {
        candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
        continue;
      }
      // 检查分钟
      if (allowedMins && !allowedMins.includes(candidate.getMinutes())) {
        candidate.setMinutes(candidate.getMinutes() + 1, 0, 0);
        continue;
      }
      return new Date(candidate);
    }
    return null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// TaskSchedulerService 类
// ──────────────────────────────────────────────────────────

export class TaskSchedulerService {
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

  /** 是否已启动 */
  private started = false;

  /** 占位 runId 计数器（负数，递减，保证不与真实 runId 冲突） */
  private _placeholderRunIdCounter = 0;

  /** 周期轮询 DB 同步任务变更的定时器 */
  private taskPollTimer?: NodeJS.Timeout;

  /** [P1] 周期对账 runningSlots 与 DB 终态的定时器 */
  private slotReconcileTimer?: NodeJS.Timeout;

  /** [P1] 避免并发执行多次槽位对账 */
  private slotReconcileInFlight = false;

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
      logger.warn('TaskSchedulerService already started', {}, LOG_CONTEXTS.EXECUTION);
      return;
    }
    this.started = true;
    logger.info('TaskSchedulerService starting...', {}, LOG_CONTEXTS.EXECUTION);

    // [dev-11] 服务启动时从数据库恢复"运行中"的槽位
    // 解决：服务重启或部署后，之前已触发但未回调完成的任务无法在调度器中看到
    try {
      await this.recoverRunningSlots();
    } catch (err) {
      logger.errorLog(err, '[dev-11] Failed to recover running slots on startup', {});
    }

    try {
      await this.loadAndRegisterAllTasks();
    } catch (err) {
      logger.errorLog(err, 'Failed to load tasks on startup', {});
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
      concurrencyLimit: CONCURRENCY_LIMIT,
      slotReconcileIntervalMs: SLOT_RECONCILE_INTERVAL_MS,
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * [dev-11] 服务启动时从数据库恢复运行中的槽位
   * 将 DB 中 status=running 的记录重新注册进 runningSlots
   * 这样即使服务重启，调度器也能感知到当前有多少个任务在跑，不会超并发
   */
  private async recoverRunningSlots(): Promise<void> {
    const executionRepository = new ExecutionRepository(AppDataSource);
    const activeRuns = await executionRepository.getActiveRunningSlots(24);

    if (activeRuns.length === 0) {
      logger.info('[dev-11] No running slots to recover on startup', {}, LOG_CONTEXTS.EXECUTION);
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
            scannedRunIds: runIds,
            releasedCount,
          }, LOG_CONTEXTS.EXECUTION);
        }
      }
    } catch (err) {
      logger.warn('[P1] Failed to reconcile running slots with DB status', {
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
    logger.info('TaskSchedulerService stopped', {}, LOG_CONTEXTS.EXECUTION);
  }

  // ─────────────────────────────────────────────
  // 动态任务管理（供 tasks 路由调用）
  // ─────────────────────────────────────────────

  /** 添加或更新单个任务的调度（任务创建/更新时调用） */
  async registerTask(taskId: number): Promise<void> {
    const task = await this.loadTaskFromDb(taskId);
    if (!task) return;
    this.unregisterTask(taskId);
    if (task.status === 'active' && task.cronExpression) {
      this.scheduleTask(task);
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
    // [P1] 从等待队列中也清除，并取消队列超时 timer
    const removedItems = this.waitQueue.filter(item => item.taskId === taskId);
    for (const item of removedItems) {
      if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
    }
    this.waitQueue = this.waitQueue.filter(item => item.taskId !== taskId);
    logger.debug(`Task ${taskId} unregistered from scheduler`, {}, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * [P1] 获取调度器当前状态（扩展版，供监控接口使用）
   * 新增：队列深度、每个队列项的排队时长、每个运行槽位已运行时长
   */
  getStatus(): {
    running: Array<{ taskId: number; runId: number; elapsedMs: number; label?: string }>;
    queued: Array<{ taskId: number; triggerReason: string; waitMs: number; priority: number; queuePosition: number }>;
    directQueued: Array<{ label: string; waitMs: number; queuePosition: number }>;
    scheduled: number[];
    concurrencyLimit: number;
    queueDepth: number;
    directQueueDepth: number;
    maxQueueDepth: number;
  } {
    const now = Date.now();
    return {
      running: Array.from(this.runningSlots.values()).map(slot => ({
        taskId: slot.taskId,
        runId: slot.runId,
        elapsedMs: now - slot.startedAt,
        label: slot.label,
      })),
      queued: this.waitQueue.map((item, idx) => ({
        taskId: item.taskId,
        triggerReason: item.triggerReason,
        waitMs: now - item.enqueuedAt,
        priority: item.priority,
        queuePosition: idx + 1,
      })),
      directQueued: this.directQueue.map((item, idx) => ({
        label: item.label,
        waitMs: now - item.enqueuedAt,
        queuePosition: idx + 1,
      })),
      scheduled: Array.from(this.taskCache.keys()),
      concurrencyLimit: CONCURRENCY_LIMIT,
      queueDepth: this.waitQueue.length,
      directQueueDepth: this.directQueue.length,
      maxQueueDepth: MAX_QUEUE_DEPTH,
    };
  }

  /**
   * [P1] 查询某个任务在队列中的位置（供前端显示"排队中"状态）
   * @returns 1-based position，0 表示不在队列中
   */
  getQueuePosition(taskId: number): number {
    const idx = this.waitQueue.findIndex(item => item.taskId === taskId);
    return idx === -1 ? 0 : idx + 1;
  }

  /**
   * 异步直连入队（run-case / run-batch 推荐使用）
   *
   * 行为：
   * - 立即返回（非阻塞），不等待槽位
   * - 若当前槽位有空余，则 setImmediate 后异步调用 job()
   * - 若槽位满，则将 job 放入 directQueue，待槽位释放后自动触发
   * - 队列已满（MAX_QUEUE_DEPTH）→ 抛出错误（调用方返回 503）
   *
   * @param label    来源标识（如 "case:123"），用于日志和监控展示
   * @param job      异步任务回调，槽位可用时执行；接收占位 runId（负数），
   *                 job 内部应调用 registerDirectSlot(realRunId, label, placeholderRunId) 替换占位
   */
  enqueueDirectJob(label: string, job: (placeholderRunId: number) => Promise<void>): void {
    if (this.runningSlots.size < CONCURRENCY_LIMIT) {
      // 有空余槽位，立即预占一个槽位，再异步执行 job
      const placeholderRunId = --this._placeholderRunIdCounter;
      const placeholderTimer = setTimeout(() => {
        if (this.runningSlots.has(placeholderRunId)) {
          this.runningSlots.delete(placeholderRunId);
          logger.warn(`[Direct] Placeholder slot ${placeholderRunId} for ${label} expired (immediate path)`, {
            label,
          }, LOG_CONTEXTS.EXECUTION);
          this.drainDirectQueue();
          this.drainQueue();
        }
      }, 30_000);
      if (placeholderTimer.unref) placeholderTimer.unref();

      this.runningSlots.set(placeholderRunId, {
        taskId: 0,
        runId: placeholderRunId,
        startedAt: Date.now(),
        timeoutTimer: placeholderTimer,
        label: `placeholder:${label}`,
      });

      logger.debug(`[Direct] Slot pre-allocated immediately (placeholder=${placeholderRunId}) for ${label}`, {
        slotsUsed: this.runningSlots.size,
        limit: CONCURRENCY_LIMIT,
      }, LOG_CONTEXTS.EXECUTION);

      setImmediate(() => job(placeholderRunId).catch(err => {
        logger.errorLog(err, `[Direct] Immediate job failed for ${label}`, { label });
      }));
      return;
    }

    // 队列深度保护
    if (this.directQueue.length >= MAX_QUEUE_DEPTH) {
      logger.warn(`[Direct] Queue full, rejecting ${label}`, {
        directQueueDepth: this.directQueue.length,
        maxQueueDepth: MAX_QUEUE_DEPTH,
      }, LOG_CONTEXTS.EXECUTION);
      throw new Error(`并发执行队列已满（${MAX_QUEUE_DEPTH}），请稍后再试`);
    }

    // 包装成 DirectQueueItem，resolve(placeholderRunId) 时执行 job
    const item: DirectQueueItem = {
      enqueuedAt: Date.now(),
      label,
      resolve: (placeholderRunId: number) => {
        job(placeholderRunId).catch(err => {
          logger.errorLog(err, `[Direct] Queued job failed for ${label}`, { label });
        });
      },
      reject: (err: Error) => {
        logger.warn(`[Direct] Queued job rejected for ${label}: ${err.message}`, { label }, LOG_CONTEXTS.EXECUTION);
      },
    };

    // 队列超时自动移除（超时后不再执行，但 runId 已创建，状态会因无回调而由 slot 超时处理）
    item.timeoutTimer = setTimeout(() => {
      const idx = this.directQueue.indexOf(item);
      if (idx !== -1) {
        this.directQueue.splice(idx, 1);
        logger.warn(`[Direct] Queue item timed out for ${label}`, {
          waitMs: Date.now() - item.enqueuedAt,
        }, LOG_CONTEXTS.EXECUTION);
        item.reject(new Error(`排队等待超时（${Math.round(QUEUE_ITEM_TIMEOUT_MS / 1000)}秒），任务已取消`));
      }
    }, QUEUE_ITEM_TIMEOUT_MS);
    if (item.timeoutTimer.unref) item.timeoutTimer.unref();

    this.directQueue.push(item);

    logger.info(`[Direct] ${label} queued (concurrency limit ${CONCURRENCY_LIMIT} reached)`, {
      label,
      directQueuePosition: this.directQueue.length,
      slotsUsed: this.runningSlots.size,
    }, LOG_CONTEXTS.EXECUTION);

    // 入队后立即尝试一次 drain，防止入队时恰好有槽位释放的竞态
    setImmediate(() => this.drainDirectQueue());
  }

  /**
   * 直连槽位申请（run-case / run-batch 专用）
   *
   * 行为：
   * - 当前 runningSlots 未满 → 立即返回（可立即执行）
   * - 已满但队列未满 → 排队等待，直到有槽位释放（Promise 在槽位可用时 resolve）
   * - 队列已满 → 立即 reject（返回 503）
   * - 等待超时（QUEUE_ITEM_TIMEOUT_MS）→ 自动 reject
   *
   * 注意：调用方必须在执行完成（或失败）后调用 releaseDirectSlot(runId) 释放槽位。
   *
   * @param label 来源标识（如 "case:123"），用于日志和监控展示
   * @returns Promise<void>，resolve 时可以开始执行
   */
  async acquireDirectSlot(label: string): Promise<void> {
    if (this.runningSlots.size < CONCURRENCY_LIMIT) {
      logger.debug(`[Direct] Slot acquired immediately for ${label}`, {
        slotsUsed: this.runningSlots.size,
        limit: CONCURRENCY_LIMIT,
      }, LOG_CONTEXTS.EXECUTION);
      return; // 直接通过
    }

    // 队列深度保护
    if (this.directQueue.length >= MAX_QUEUE_DEPTH) {
      logger.warn(`[Direct] Queue full, rejecting ${label}`, {
        directQueueDepth: this.directQueue.length,
        maxQueueDepth: MAX_QUEUE_DEPTH,
      }, LOG_CONTEXTS.EXECUTION);
      throw new Error(`并发执行队列已满（${MAX_QUEUE_DEPTH}），请稍后再试`);
    }

    // 排队等待
    return new Promise<void>((resolve, reject) => {
      const item: DirectQueueItem = {
        enqueuedAt: Date.now(),
        label,
        resolve: (_placeholderRunId: number) => resolve(),
        reject,
      };

      // 队列超时自动移除
      item.timeoutTimer = setTimeout(() => {
        const idx = this.directQueue.indexOf(item);
        if (idx !== -1) {
          this.directQueue.splice(idx, 1);
          logger.warn(`[Direct] Queue item timed out for ${label}`, {
            waitMs: Date.now() - item.enqueuedAt,
          }, LOG_CONTEXTS.EXECUTION);
          reject(new Error(`排队等待超时（${Math.round(QUEUE_ITEM_TIMEOUT_MS / 1000)}秒），请稍后再试`));
        }
      }, QUEUE_ITEM_TIMEOUT_MS);
      if (item.timeoutTimer.unref) item.timeoutTimer.unref();

      this.directQueue.push(item);

      logger.info(`[Direct] ${label} queued (concurrency limit ${CONCURRENCY_LIMIT} reached)`, {
        label,
        directQueuePosition: this.directQueue.length,
        slotsUsed: this.runningSlots.size,
      }, LOG_CONTEXTS.EXECUTION);
    });
  }

  /**
   * 直连槽位注册（enqueueDirectJob job 内部调用，将真实 runId 替换占位槽位）
   * 槽位持有至 Jenkins 回调（releaseSlotByRunId）或超时自动释放
   *
   * @param runId           真实的执行 runId（正数）
   * @param label           来源标识
   * @param placeholderRunId 占位 runId（负数），注册前先删除占位槽位；不传则不删
   */
  registerDirectSlot(runId: number, label: string, placeholderRunId?: number): void {
    // 移除占位槽位（释放占位的超时 timer）
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
          runId,
          label,
          heldMs: SLOT_HOLD_TIMEOUT_MS,
        }, LOG_CONTEXTS.EXECUTION);
        this.drainDirectQueue();
        this.drainQueue();
      }
    }, SLOT_HOLD_TIMEOUT_MS);

    if (timeoutTimer.unref) timeoutTimer.unref();

    this.runningSlots.set(runId, {
      taskId: 0, // 直连执行无 taskId
      runId,
      startedAt: Date.now(),
      timeoutTimer,
      label,
    });

    logger.info(`[Direct] Slot registered for runId=${runId} (${label})`, {
      runId,
      label,
      slotsUsed: this.runningSlots.size,
      slotsLimit: CONCURRENCY_LIMIT,
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * 从直连等待队列中取出下一个等待方并通知（FIFO）
   * 在槽位释放后（releaseSlotByRunId / drainQueue）调用
   *
   * 关键设计：drain 出一个 job 后，立即用占位 runId（负数）预占一个槽位，
   * 防止 while 循环在 job 异步执行前重复 drain（竞态条件）。
   * job 内部调用 registerDirectSlot(realRunId) 时会覆盖占位槽位。
   */
  private drainDirectQueue(): void {
    while (this.directQueue.length > 0 && this.runningSlots.size < CONCURRENCY_LIMIT) {
      const next = this.directQueue.shift()!;
      if (next.timeoutTimer) clearTimeout(next.timeoutTimer);

      // 用占位 runId（负数，递减保证唯一）立即预占槽位，防止并发多取
      const placeholderRunId = --this._placeholderRunIdCounter;
      const placeholderTimer = setTimeout(() => {
        // 占位超时（正常情况下 registerDirectSlot 会在几毫秒内替换掉占位）
        if (this.runningSlots.has(placeholderRunId)) {
          this.runningSlots.delete(placeholderRunId);
          logger.warn(`[Direct] Placeholder slot ${placeholderRunId} for ${next.label} expired, releasing`, {
            label: next.label,
          }, LOG_CONTEXTS.EXECUTION);
          this.drainDirectQueue();
          this.drainQueue();
        }
      }, 30_000); // 30秒兜底
      if (placeholderTimer.unref) placeholderTimer.unref();

      this.runningSlots.set(placeholderRunId, {
        taskId: 0,
        runId: placeholderRunId,
        startedAt: Date.now(),
        timeoutTimer: placeholderTimer,
        label: `placeholder:${next.label}`,
      });

      logger.debug(`[Direct] Draining queue: slot pre-allocated (placeholder=${placeholderRunId}) for ${next.label} (waited ${Date.now() - next.enqueuedAt}ms)`, {
        label: next.label,
        placeholderRunId,
        directQueueDepth: this.directQueue.length,
        slotsUsed: this.runningSlots.size,
      }, LOG_CONTEXTS.EXECUTION);

      // 通知 job 执行；job 内部应调用 registerDirectSlot(realRunId) 替换占位槽位
      next.resolve(placeholderRunId);
    }
  }

  /**
   * [P1] 释放运行槽位
   * 默认在 Jenkins 回调成功后调用；也可由对账任务兜底释放
   */
  releaseSlotByRunId(runId: number, source: 'callback' | 'db_reconcile' | 'db_missing' = 'callback'): void {
    const slot = this.runningSlots.get(runId);
    // 不允许通过此方法释放占位槽位（负数 runId），占位由 registerDirectSlot 内部管理
    if (!slot || runId < 0) return;

    clearTimeout(slot.timeoutTimer);
    this.runningSlots.delete(runId);

    logger.info(`[P1] Slot released for runId=${runId} (taskId=${slot.taskId}) via ${source}`, {
      runId,
      taskId: slot.taskId,
      source,
      heldMs: Date.now() - slot.startedAt,
    }, LOG_CONTEXTS.EXECUTION);

    // 槽位释放后，尝试从队列中取出下一个任务（任务队列和直连队列都需要 drain）
    this.drainDirectQueue();
    this.drainQueue();
  }

  // ─────────────────────────────────────────────
  // 内部：加载与注册
  // ─────────────────────────────────────────────

  private async loadAndRegisterAllTasks(): Promise<void> {
    interface TaskRow {
      id: number;
      name: string;
      cron_expression: string;
      case_ids: string;
      project_id: number;
      environment_id: number | null;
      status: 'active' | 'paused' | 'archived';
      max_retries: number | null;
      retry_delay_ms: number | null;
      last_run_at: string | null;
    }

    const rows = await query<TaskRow[]>(`
      SELECT t.id, t.name, t.cron_expression, t.case_ids, t.project_id,
             t.environment_id, t.status,
             t.max_retries, t.retry_delay_ms,
             (SELECT MAX(start_time) FROM Auto_TestCaseTaskExecutions WHERE task_id = t.id) as last_run_at
      FROM Auto_TestCaseTasks t
      WHERE t.trigger_type = 'scheduled'
        AND t.status IN ('active', 'paused')
    `);

    logger.info(`Loaded ${rows.length} scheduled tasks from DB`, {}, LOG_CONTEXTS.EXECUTION);

    for (const row of rows) {
      let caseIds: number[] = [];
      try { caseIds = JSON.parse(row.case_ids || '[]'); } catch { /* ignore */ }

      const task: ScheduledTask = {
        id: row.id,
        name: row.name,
        cronExpression: row.cron_expression,
        caseIds,
        projectId: row.project_id || 1,
        environmentId: row.environment_id ?? undefined,
        status: row.status,
        maxRetries: row.max_retries ?? 1,
        retryDelayMs: row.retry_delay_ms ?? 30_000,
        lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
      };

      this.taskCache.set(task.id, task);

      if (task.status !== 'active') continue;

      // 漏触发补偿
      await this.compensateMissedFires(task);

      // 注册下次触发
      this.scheduleTask(task);
    }
  }

  private async loadTaskFromDb(taskId: number): Promise<ScheduledTask | null> {
    interface TaskRow {
      id: number;
      name: string;
      cron_expression: string | null;
      case_ids: string | null;
      project_id: number | null;
      environment_id: number | null;
      status: 'active' | 'paused' | 'archived';
      max_retries: number | null;
      retry_delay_ms: number | null;
      trigger_type: string;
    }

    const row = await queryOne<TaskRow>(
      `SELECT id, name, cron_expression, case_ids, project_id, environment_id, status, max_retries, retry_delay_ms, trigger_type
       FROM Auto_TestCaseTasks WHERE id = ?`,
      [taskId]
    );

    if (!row || row.trigger_type !== 'scheduled' || !row.cron_expression) return null;

    let caseIds: number[] = [];
    try { caseIds = JSON.parse(row.case_ids || '[]'); } catch { /* ignore */ }

    return {
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      caseIds,
      projectId: row.project_id || 1,
      environmentId: row.environment_id ?? undefined,
      status: row.status,
      maxRetries: row.max_retries ?? 1,
      retryDelayMs: row.retry_delay_ms ?? 30_000,
      lastRunAt: null,
    };
  }

  /**
   * 漏触发补偿
   * 若 now - lastRunAt > 触发间隔，说明服务重启期间有漏触发，立即补跑一次
   */
  private async compensateMissedFires(task: ScheduledTask): Promise<void> {
    if (!task.lastRunAt) {
      // 从未执行过，不需要补偿
      return;
    }

    const intervalMs = parseCronToIntervalMs(task.cronExpression);
    if (!intervalMs) return;

    const elapsed = Date.now() - task.lastRunAt.getTime();

    if (elapsed > intervalMs && elapsed <= MAX_MISSED_WINDOW_MS) {
      logger.info(`Task ${task.id} (${task.name}) missed ${Math.floor(elapsed / 60_000)} min, compensating...`, {
        taskId: task.id,
        lastRunAt: task.lastRunAt,
        elapsed,
        intervalMs,
      }, LOG_CONTEXTS.EXECUTION);

      // 记录补偿日志到审计表
      await this.recordAuditLog(task.id, 'compensated', SCHEDULER_USER_ID, {
        reason: 'missed_fire_compensation',
        lastRunAt: task.lastRunAt,
        elapsedMs: elapsed,
      });

      // 异步触发，不阻塞启动
      setImmediate(() => this.dispatchTask(task.id, 'scheduled').catch(err => {
        logger.errorLog(err, `Compensation dispatch failed for task ${task.id}`, {});
      }));
    }
  }

  /**
   * 注册下一次触发定时器
   */
  private scheduleTask(task: ScheduledTask): void {
    const next = getNextCronTime(task.cronExpression);
    if (!next) {
      logger.warn(`Cannot compute next run time for task ${task.id}, expr=${task.cronExpression}`, {}, LOG_CONTEXTS.EXECUTION);
      return;
    }

    const delayMs = Math.max(0, next.getTime() - Date.now());

    const timer = setTimeout(async () => {
      this.timers.delete(task.id);

      const freshTask = this.taskCache.get(task.id);
      if (!freshTask || freshTask.status !== 'active') return;

      await this.dispatchTask(task.id, 'scheduled').catch(err => {
        logger.errorLog(err, `Scheduled dispatch failed for task ${task.id}`, {});
      });

      // 重新调度下次触发
      const updatedTask = this.taskCache.get(task.id);
      if (updatedTask && updatedTask.status === 'active') {
        this.scheduleTask(updatedTask);
      }
    }, delayMs);

    if (timer.unref) timer.unref();
    this.timers.set(task.id, timer);

    logger.debug(`Task ${task.id} scheduled at ${next.toISOString()} (in ${Math.round(delayMs / 1000)}s)`, {
      taskId: task.id,
    }, LOG_CONTEXTS.EXECUTION);
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
  async dispatchTask(taskId: number, triggerReason: 'scheduled' | 'manual' | 'retry' = 'scheduled', operatorId?: number): Promise<void> {
    if (this.runningSlots.size >= CONCURRENCY_LIMIT) {
      // [P1] 队列深度保护
      if (this.waitQueue.length >= MAX_QUEUE_DEPTH) {
        logger.warn(`Task ${taskId} dropped: queue full (depth=${this.waitQueue.length}/${MAX_QUEUE_DEPTH})`, {
          taskId,
          queueDepth: this.waitQueue.length,
          maxQueueDepth: MAX_QUEUE_DEPTH,
        }, LOG_CONTEXTS.EXECUTION);
        return;
      }

      // [P1] 同一任务已在队列中则跳过（防重复入队）
      if (this.waitQueue.some(item => item.taskId === taskId)) {
        logger.debug(`Task ${taskId} already in queue, skipping duplicate enqueue`, {}, LOG_CONTEXTS.EXECUTION);
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
        enqueuedAt: Date.now(),
        priority,
      };

      // [P1] 队列项超时：超过 QUEUE_ITEM_TIMEOUT_MS 自动移除
      queueItem.timeoutTimer = setTimeout(() => {
        const idx = this.waitQueue.findIndex(it => it === queueItem);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
          logger.warn(`Task ${taskId} queue item timed out and removed (waited ${QUEUE_ITEM_TIMEOUT_MS}ms)`, {
            taskId,
            waitMs: Date.now() - queueItem.enqueuedAt,
          }, LOG_CONTEXTS.EXECUTION);
        }
      }, QUEUE_ITEM_TIMEOUT_MS);
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
        taskId,
        triggerReason,
        priority,
        queuePosition: this.waitQueue.findIndex(it => it === queueItem) + 1,
        queueDepth: this.waitQueue.length,
      }, LOG_CONTEXTS.EXECUTION);
      return;
    }

    logger.info(`Task ${taskId} dispatching (reason=${triggerReason})`, {
      taskId,
      runningSlots: this.runningSlots.size,
      limit: CONCURRENCY_LIMIT,
    }, LOG_CONTEXTS.EXECUTION);

    try {
      // [P1] executeTask 内部会在 Jenkins 触发成功后注册 slot，失败时不注册（不占用槽位）
      await this.executeTask(taskId, triggerReason, operatorId);
    } catch (err) {
      logger.errorLog(err, `Task ${taskId} execution error`, { taskId });
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
  private async executeTask(taskId: number, triggerReason: string, operatorId?: number): Promise<void> {
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
      logger.info(`Task ${taskId} skipped (status=${row?.status ?? 'not found'})`, {}, LOG_CONTEXTS.EXECUTION);
      return;
    }

    let caseIds: number[] = [];
    try { caseIds = JSON.parse(row.case_ids || '[]'); } catch { /* ignore */ }

    if (caseIds.length === 0) {
      logger.warn(`Task ${taskId} has no caseIds, skipping`, {}, LOG_CONTEXTS.EXECUTION);
      return;
    }

    // 更新缓存
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
      lastRunAt: new Date(),
    };
    this.taskCache.set(taskId, updatedCache);

    // 获取脚本路径
    const cases = await AppDataSource.getRepository(TestCase).find({
      where: { id: In(caseIds), enabled: true },
      select: ['id', 'scriptPath'],
    });
    const scriptPaths = [...new Set(cases.map(c => c.scriptPath?.trim()).filter(Boolean))] as string[];

    const callbackUrl = `${process.env.API_CALLBACK_URL || 'http://localhost:3000'}/api/jenkins/callback`;

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
      taskId,
      runId: execution.runId,
      executionId: execution.executionId,
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
    });

    // 2. 触发 Jenkins（非阻塞，失败时不影响运行记录已创建）
    if (scriptPaths.length > 0) {
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
            logger.info(`[dev-10] Task ${taskId} build resolved via queueId poll`, {
              taskId,
              runId: capturedRunId,
              buildId,
              buildUrl,
            }, LOG_CONTEXTS.EXECUTION);
            await executionService.updateBatchJenkinsInfo(capturedRunId, { buildId, buildUrl });
          },
          async (reason: 'cancelled' | 'timeout') => {
            // [dev-11] Jenkins 队列取消/超时，主动将平台执行状态更新为 aborted 并释放槽位
            logger.warn(`[dev-11] Task ${taskId} Jenkins queue ${reason}, marking execution as aborted`, {
              taskId,
              runId: capturedRunId,
              reason,
            }, LOG_CONTEXTS.EXECUTION);
            try {
              await executionService.markExecutionAborted(capturedRunId, `Jenkins build ${reason}`);
            } catch (err) {
              logger.warn(`[dev-11] Failed to mark task execution as aborted`, {
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
            message: triggerResult.message,
          }, LOG_CONTEXTS.EXECUTION);
          throw new Error(`Jenkins trigger failed: ${triggerResult.message}`);
        }
      } catch (jenkinsErr) {
        // Jenkins 失败，将该任务记入重试（不注册槽位，不占用并发名额）
        throw jenkinsErr;
      }
    } else {
      logger.warn(`Task ${taskId} has no script paths, execution record created but Jenkins not triggered`, {}, LOG_CONTEXTS.EXECUTION);
      // 无脚本路径时，任务不会真正执行，不需要占用槽位
    }
  }

  /**
   * [P1] 注册运行中槽位，并设置超时自动释放
   */
  private registerRunningSlot(taskId: number, runId: number): void {
    // 超时自动释放槽位（防止 Jenkins 挂死或回调永远不来）
    const timeoutTimer = setTimeout(() => {
      const slot = this.runningSlots.get(runId);
      if (slot) {
        this.runningSlots.delete(runId);
        logger.warn(`[P1] Slot for runId=${runId} (taskId=${taskId}) auto-released after ${SLOT_HOLD_TIMEOUT_MS}ms timeout`, {
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
      runId,
      taskId,
      slotsUsed: this.runningSlots.size,
      slotsLimit: CONCURRENCY_LIMIT,
    }, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * 失败重试处理
   */
  private async handleTaskFailure(taskId: number, err: unknown): Promise<void> {
    const task = this.taskCache.get(taskId);
    if (!task) return;

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
        error: err instanceof Error ? err.message : String(err),
      }, LOG_CONTEXTS.EXECUTION);

      await this.recordAuditLog(taskId, 'retry_scheduled', SCHEDULER_USER_ID, {
        attempt: state.attempt,
        maxRetries: state.maxRetries,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      const retryTimer = setTimeout(async () => {
        this.retryStates.delete(taskId);
        await this.dispatchTask(taskId, 'retry').catch(retryErr => {
          logger.errorLog(retryErr, `Task ${taskId} retry dispatch failed`, {});
        });
      }, delay);

      if (retryTimer.unref) retryTimer.unref();
      state.timer = retryTimer;
    } else {
      logger.error(`Task ${taskId} permanently failed after ${state.maxRetries} retries`, {
        error: err instanceof Error ? err.message : String(err),
      }, LOG_CONTEXTS.EXECUTION);

      await this.recordAuditLog(taskId, 'permanently_failed', SCHEDULER_USER_ID, {
        attempts: state.attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      this.retryStates.delete(taskId);
    }
  }

  /** [P1] 从优先级队列取出任务执行（按 priority ASC, enqueuedAt ASC 排序） */
  private drainQueue(): void {
    while (this.waitQueue.length > 0 && this.runningSlots.size < CONCURRENCY_LIMIT) {
      const next = this.waitQueue.shift()!;
      // 取消队列超时 timer（已出队，不再需要）
      if (next.timeoutTimer) clearTimeout(next.timeoutTimer);

      logger.debug(`Draining queue: dispatching task ${next.taskId} (priority=${next.priority}, waited=${Date.now() - next.enqueuedAt}ms)`, {
        taskId: next.taskId,
        triggerReason: next.triggerReason,
        queueDepth: this.waitQueue.length,
      }, LOG_CONTEXTS.EXECUTION);

      this.dispatchTask(next.taskId, next.triggerReason, next.operatorId).catch(err => {
        logger.errorLog(err, `Queue drain dispatch failed for task ${next.taskId}`, {});
      });
    }
  }

  // ─────────────────────────────────────────────
  // 内部：定时轮询，同步 DB 变更
  // ─────────────────────────────────────────────

  private async pollTaskChanges(): Promise<void> {
    try {
      interface TaskPollRow {
        id: number;
        name: string;
        cron_expression: string | null;
        case_ids: string | null;
        project_id: number | null;
        environment_id: number | null;
        status: 'active' | 'paused' | 'archived';
        max_retries: number | null;
        retry_delay_ms: number | null;
        trigger_type: string;
      }

      const rows = await query<TaskPollRow[]>(`
        SELECT id, name, cron_expression, case_ids, project_id, environment_id, status, max_retries, retry_delay_ms, trigger_type
        FROM Auto_TestCaseTasks
        WHERE trigger_type = 'scheduled'
      `);

      const dbIds = new Set(rows.map(r => r.id));

      // 移除已在调度中但 DB 已删除的任务
      for (const [id] of this.taskCache) {
        if (!dbIds.has(id)) {
          this.unregisterTask(id);
          logger.info(`Task ${id} removed from scheduler (deleted from DB)`, {}, LOG_CONTEXTS.EXECUTION);
        }
      }

      // 注册新增的或状态变为 active 的任务
      for (const row of rows) {
        if (!row.cron_expression) continue;
        const cached = this.taskCache.get(row.id);

        if (!cached && row.status === 'active') {
          // 新任务
          let caseIds: number[] = [];
          try { caseIds = JSON.parse(row.case_ids || '[]'); } catch { /* ignore */ }
          const newTask: ScheduledTask = {
            id: row.id,
            name: row.name,
            cronExpression: row.cron_expression,
            caseIds,
            projectId: row.project_id || 1,
            environmentId: row.environment_id ?? undefined,
            status: row.status,
            maxRetries: row.max_retries ?? 1,
            retryDelayMs: row.retry_delay_ms ?? 30_000,
            lastRunAt: null,
          };
          this.taskCache.set(row.id, newTask);
          this.scheduleTask(newTask);
          logger.info(`New task ${row.id} registered by poll`, {}, LOG_CONTEXTS.EXECUTION);
        } else if (cached && cached.status !== row.status) {
          // 状态变更
          cached.status = row.status;
          if (row.status !== 'active') {
            this.unregisterTask(row.id);
          } else {
            this.scheduleTask(cached);
          }
        } else if (cached && cached.cronExpression !== row.cron_expression) {
          // Cron 表达式变更，重新调度
          cached.cronExpression = row.cron_expression;
          this.unregisterTask(row.id);
          this.taskCache.set(row.id, cached);
          if (row.status === 'active') {
            this.scheduleTask(cached);
          }
        }
      }
    } catch (err) {
      logger.errorLog(err, 'TaskScheduler poll failed', {});
    }
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
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE id=id`, // 防止重复写入
        [taskId, action, operatorId, JSON.stringify(metadata)]
      );
    } catch {
      // 审计日志写入失败不应影响主流程，静默处理
    }
  }
}

export const taskSchedulerService = new TaskSchedulerService();
