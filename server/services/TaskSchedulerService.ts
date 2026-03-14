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
 */
interface RunningSlot {
  taskId: number;
  runId: number;
  startedAt: number;
  /** 执行超时 timer handle */
  timeoutTimer: NodeJS.Timeout;
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

  /** 重试状态 */
  private retryStates: Map<number, RetryState> = new Map();

  /** 内存中缓存的任务配置 */
  private taskCache: Map<number, ScheduledTask> = new Map();

  /** 是否已启动 */
  private started = false;

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

    try {
      await this.loadAndRegisterAllTasks();
    } catch (err) {
      logger.errorLog(err, 'Failed to load tasks on startup', {});
    }

    // 每 60 秒轮询一次，检查是否有新 scheduled 任务或任务更新
    const pollTimer = setInterval(() => this.pollTaskChanges(), 60 * 1000);
    // 避免 interval 阻止进程退出
    if (pollTimer.unref) pollTimer.unref();

    logger.info('TaskSchedulerService started', {
      concurrencyLimit: CONCURRENCY_LIMIT,
    }, LOG_CONTEXTS.EXECUTION);
  }

  /** 停止所有定时器，清理资源 */
  stop(): void {
    for (const [taskId, timer] of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(taskId);
    }
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
    this.retryStates.clear();
    this.taskCache.clear();
    this.runningSlots.clear();
    this.waitQueue = [];
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
    running: Array<{ taskId: number; runId: number; elapsedMs: number }>;
    queued: Array<{ taskId: number; triggerReason: string; waitMs: number; priority: number; queuePosition: number }>;
    scheduled: number[];
    concurrencyLimit: number;
    queueDepth: number;
    maxQueueDepth: number;
  } {
    const now = Date.now();
    return {
      running: Array.from(this.runningSlots.values()).map(slot => ({
        taskId: slot.taskId,
        runId: slot.runId,
        elapsedMs: now - slot.startedAt,
      })),
      queued: this.waitQueue.map((item, idx) => ({
        taskId: item.taskId,
        triggerReason: item.triggerReason,
        waitMs: now - item.enqueuedAt,
        priority: item.priority,
        queuePosition: idx + 1,
      })),
      scheduled: Array.from(this.taskCache.keys()),
      concurrencyLimit: CONCURRENCY_LIMIT,
      queueDepth: this.waitQueue.length,
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
   * [P1] Jenkins 回调时通知调度器释放槽位（核心：槽位释放时机后移）
   * 由 jenkins.ts 回调处理成功后调用
   */
  releaseSlotByRunId(runId: number): void {
    const slot = this.runningSlots.get(runId);
    if (!slot) return;

    clearTimeout(slot.timeoutTimer);
    this.runningSlots.delete(runId);

    logger.info(`[P1] Slot released for runId=${runId} (taskId=${slot.taskId}) via callback`, {
      runId,
      taskId: slot.taskId,
      heldMs: Date.now() - slot.startedAt,
    }, LOG_CONTEXTS.EXECUTION);

    // 槽位释放后，尝试从队列中取出下一个任务
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
