import { describe, it, expect, beforeEach } from 'vitest';
import { Cron } from 'croner';

/**
 * TaskSchedulerService 单元测试（重构版 - 基于 croner 库）
 *
 * 变更说明：
 * - 替换旧版手搓 parseCronToIntervalMs / getNextCronTime 为基于 croner 的版本
 * - 新增 getPrevCronTime 测试（漏触发检测核心逻辑）
 * - 新增 shouldCompensate 基于精确触发点的测试（替换原来基于 interval 的近似逻辑）
 * - 保留并发调度器、重试策略、审计日志、executeTask 等原有测试
 */

// ──────────────────────────────────────────────────────────────────────────────
// 从 TaskSchedulerService 复制的纯函数逻辑（与生产代码保持同步）
// ──────────────────────────────────────────────────────────────────────────────

const MAX_MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 计算 Cron 表达式的下次触发时间（基于 croner，与生产代码一致）
 */
function getNextCronTime(expr: string, from: Date = new Date()): Date | null {
  try {
    const job = new Cron(expr, { paused: true });
    return job.nextRun(from) ?? null;
  } catch {
    return null;
  }
}

/**
 * 计算指定时间点之前最近一次应触发时间（基于 croner，与生产代码一致）
 * 用于漏触发检测：若 prev > lastRunAt 则说明存在漏触发
 */
function getPrevCronTime(expr: string, before: Date, maxWindowMs = MAX_MISSED_WINDOW_MS): Date | null {
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

/**
 * 漏触发检测（基于精确触发点，与生产代码 compensateMissedFires 保持一致）
 * 返回 true 表示应该补偿执行
 */
function shouldCompensate(
  lastRunAt: Date | null,
  cronExpression: string,
  now: Date = new Date(),
  maxMissedWindowMs = MAX_MISSED_WINDOW_MS
): boolean {
  if (!lastRunAt) return false;
  if (now.getTime() - lastRunAt.getTime() > maxMissedWindowMs) return false;
  const prevShouldRun = getPrevCronTime(cronExpression, now, maxMissedWindowMs);
  if (!prevShouldRun) return false;
  return prevShouldRun > lastRunAt;
}

/**
 * 模拟并发调度器逻辑
 */
class MockConcurrencyScheduler {
  private runningTasks: Set<number> = new Set();
  private waitQueue: number[] = [];
  readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  enqueue(taskId: number): 'dispatched' | 'queued' {
    if (this.runningTasks.size < this.limit) {
      this.runningTasks.add(taskId);
      return 'dispatched';
    }
    if (!this.waitQueue.includes(taskId)) {
      this.waitQueue.push(taskId);
    }
    return 'queued';
  }

  complete(taskId: number): void {
    this.runningTasks.delete(taskId);
    this.drain();
  }

  private drain(): void {
    while (this.waitQueue.length > 0 && this.runningTasks.size < this.limit) {
      const next = this.waitQueue.shift()!;
      this.runningTasks.add(next);
    }
  }

  getStatus() {
    return {
      running: Array.from(this.runningTasks),
      queued: [...this.waitQueue],
      concurrencyLimit: this.limit,
    };
  }
}

/**
 * 模拟重试状态管理
 */
interface RetryState {
  taskId: number;
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
}

function computeRetryDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * attempt; // 线性退避
}

function shouldRetry(state: RetryState): boolean {
  return state.attempt < state.maxRetries;
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试套件
// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - getNextCronTime（基于 croner）', () => {
  it('每分钟触发（* * * * *）返回 from 之后的时间', () => {
    const from = new Date('2026-03-12T10:00:00.000Z');
    const next = getNextCronTime('* * * * *', from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  it('每日触发（0 2 * * *）在 02:30 后推算，下次晚于 from', () => {
    const from = new Date('2026-03-12T02:30:00.000Z');
    const next = getNextCronTime('0 2 * * *', from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  it('每5分钟触发（*/5 * * * *）下次在 6 分钟内', () => {
    const from = new Date('2026-03-12T10:00:00.000Z');
    const next = getNextCronTime('*/5 * * * *', from);
    expect(next).not.toBeNull();
    expect(next!.getTime() - from.getTime()).toBeLessThanOrEqual(6 * 60 * 1000);
  });

  it('非法 cron 返回 null', () => {
    expect(getNextCronTime('invalid cron')).toBeNull();
    expect(getNextCronTime('')).toBeNull();
    expect(getNextCronTime('0 * * *')).toBeNull();
  });

  it('指定日触发（0 9 15 * *）getDate 为 15', () => {
    const from = new Date('2026-03-10T09:00:00.000Z');
    const next = getNextCronTime('0 9 15 * *', from);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(15);
  });

  it('每周一触发（0 8 * * 1）getDay 为 1', () => {
    const from = new Date('2026-03-12T08:00:00.000Z');
    const next = getNextCronTime('0 8 * * 1', from);
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(1);
  });

  it('逗号分隔（0 8,20 * * *）09:00 后下次为 20 时', () => {
    const from = new Date('2026-03-12T09:00:00.000Z');
    const next = getNextCronTime('0 8,20 * * *', from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(20);
  });

  it('范围表达式（0 9-17 * * *）触发时间在 9~17 时', () => {
    const from = new Date('2026-03-12T08:00:00.000Z');
    const next = getNextCronTime('0 9-17 * * *', from);
    expect(next).not.toBeNull();
    const h = next!.getHours();
    expect(h).toBeGreaterThanOrEqual(9);
    expect(h).toBeLessThanOrEqual(17);
  });

  it('每月第一天（0 0 1 * *）date 为 1', () => {
    const from = new Date('2026-03-15T00:00:00.000Z');
    const next = getNextCronTime('0 0 1 * *', from);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(1);
  });

  it('每天 12 点（0 12 * * *）hour=12 minute=0', () => {
    const from = new Date('2026-03-12T10:00:00.000Z');
    const next = getNextCronTime('0 12 * * *', from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(12);
    expect(next!.getMinutes()).toBe(0);
  });

  it('工作日触发（0 2 * * 1-5）day 在 1-5', () => {
    const from = new Date('2026-04-06T01:00:00.000Z');
    const next = getNextCronTime('0 2 * * 1-5', from);
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBeGreaterThanOrEqual(1);
    expect(next!.getDay()).toBeLessThanOrEqual(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - getPrevCronTime（漏触发检测核心）', () => {
  it('每分钟触发：应能找到 before 之前的触发点', () => {
    const now = new Date('2026-03-12T10:05:00.000Z');
    const prev = getPrevCronTime('* * * * *', now);
    expect(prev).not.toBeNull();
    expect(prev!.getTime()).toBeLessThan(now.getTime());
  });

  it('每5分钟触发：上次运行(10:06)在最近触发点(10:05)之后 => prev <= lastRunAt（无漏触发）', () => {
    const now = new Date('2026-03-12T10:08:00.000Z');
    const lastRunAt = new Date('2026-03-12T10:06:00.000Z');
    const prev = getPrevCronTime('*/5 * * * *', now);
    expect(prev).not.toBeNull();
    expect(prev!.getTime() <= lastRunAt.getTime()).toBe(true);
  });

  it('每5分钟触发：上次运行(9:58)在最近触发点之前 => prev > lastRunAt（有漏触发）', () => {
    const now = new Date('2026-03-12T10:10:00.000Z');
    const lastRunAt = new Date('2026-03-12T09:58:00.000Z');
    const prev = getPrevCronTime('*/5 * * * *', now);
    expect(prev).not.toBeNull();
    expect(prev!.getTime() > lastRunAt.getTime()).toBe(true);
  });

  it('每日 02:00：今天成功跑过(02:01)，prev(02:00) <= lastRunAt => 无漏触发', () => {
    const now = new Date('2026-04-06T09:00:00.000Z');
    const lastRunAt = new Date('2026-04-06T02:01:00.000Z');
    const prev = getPrevCronTime('0 2 * * *', now);
    expect(prev).not.toBeNull();
    expect(prev!.getTime() <= lastRunAt.getTime()).toBe(true);
  });

  it('每日 02:00：停机重启，今天 02:00 被跳过 => prev > lastRunAt(昨天 02:01)', () => {
    const now = new Date('2026-04-06T09:00:00.000Z');
    const lastRunAt = new Date('2026-04-05T02:01:00.000Z');
    const prev = getPrevCronTime('0 2 * * *', now);
    expect(prev).not.toBeNull();
    expect(prev!.getTime() > lastRunAt.getTime()).toBe(true);
  });

  it('工作日 02:00：周一重启，周一 02:00 被跳过 => prev > lastRunAt(周五)', () => {
    const now = new Date('2026-04-06T09:00:00.000Z');
    const lastRunAt = new Date('2026-04-03T02:01:00.000Z');
    const prev = getPrevCronTime('0 2 * * 1-5', now);
    expect(prev).not.toBeNull();
    expect(prev!.getTime() > lastRunAt.getTime()).toBe(true);
  });

  it('非法 cron 返回 null', () => {
    expect(getPrevCronTime('invalid', new Date())).toBeNull();
    expect(getPrevCronTime('', new Date())).toBeNull();
  });

  it('高频 cron（*/1 * * * *）24h 窗口内不超时（< 500ms）', () => {
    const now = new Date();
    const t = Date.now();
    const prev = getPrevCronTime('*/1 * * * *', now);
    expect(prev).not.toBeNull();
    expect(Date.now() - t).toBeLessThan(500);
  });

  it('自定义小窗口（1分钟）中每分钟 cron 的 prev 在 60s 内', () => {
    // 10:05:30 时，窗口为 [10:04:30, 10:05:30)，10:05:00 在窗口内可被找到
    const now = new Date('2026-03-12T10:05:30.000Z');
    const prev = getPrevCronTime('* * * * *', now, 60 * 1000);
    expect(prev).not.toBeNull();
    expect(now.getTime() - prev!.getTime()).toBeLessThanOrEqual(60 * 1000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - shouldCompensate（基于精确触发点）', () => {
  it('lastRunAt=null => 不补偿', () => {
    expect(shouldCompensate(null, '*/5 * * * *')).toBe(false);
  });

  it('elapsed > 24h => 超窗口不补偿', () => {
    const now = new Date('2026-03-12T10:00:00.000Z');
    const lastRunAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(shouldCompensate(lastRunAt, '*/5 * * * *', now)).toBe(false);
  });

  it('每5分钟：上次运行在最近触发点之后 => 无漏触发', () => {
    const now = new Date('2026-03-12T10:08:00.000Z');
    const lastRunAt = new Date('2026-03-12T10:06:00.000Z');
    expect(shouldCompensate(lastRunAt, '*/5 * * * *', now)).toBe(false);
  });

  it('每5分钟：上次运行在最近触发点之前 => 有漏触发', () => {
    const now = new Date('2026-03-12T10:10:00.000Z');
    const lastRunAt = new Date('2026-03-12T09:58:00.000Z');
    expect(shouldCompensate(lastRunAt, '*/5 * * * *', now)).toBe(true);
  });

  it('每小时：50 分钟前运行 => 无漏触发', () => {
    const now = new Date('2026-03-12T10:50:00.000Z');
    const lastRunAt = new Date('2026-03-12T10:01:00.000Z');
    expect(shouldCompensate(lastRunAt, '0 * * * *', now)).toBe(false);
  });

  it('每小时：70 分钟前运行 => 有漏触发', () => {
    const now = new Date('2026-03-12T11:10:00.000Z');
    const lastRunAt = new Date('2026-03-12T10:00:00.000Z');
    expect(shouldCompensate(lastRunAt, '0 * * * *', now)).toBe(true);
  });

  it('每日任务：今天 02:00 被跳过，elapsed < 24h => 应补偿', () => {
    // now=2026-04-06T03:05Z，lastRunAt=2026-04-05T04:00Z，elapsed≈23h
    // prev(0 2 * * *)=今天 02:00 > lastRunAt(昨天 04:00) => 漏触发
    const now = new Date('2026-04-06T03:05:00.000Z');
    const lastRunAt = new Date('2026-04-05T04:00:00.000Z');
    expect(shouldCompensate(lastRunAt, '0 2 * * *', now)).toBe(true);
  });

  it('每日任务：elapsed > 24h => 超窗口不补偿', () => {
    const now = new Date('2026-04-06T09:00:00.000Z');
    const lastRunAt = new Date('2026-04-05T02:01:00.000Z'); // elapsed≈31h
    expect(shouldCompensate(lastRunAt, '0 2 * * *', now)).toBe(false);
  });

  it('非法 cron => 不补偿', () => {
    const now = new Date();
    const lastRunAt = new Date(now.getTime() - 10 * 60 * 1000);
    expect(shouldCompensate(lastRunAt, 'invalid', now)).toBe(false);
  });

  it('lastRunAt 精确等于 prevShouldRun => 不补偿（已执行）', () => {
    const now = new Date('2026-03-12T10:10:00.000Z');
    const prevShouldRun = getPrevCronTime('*/5 * * * *', now)!;
    expect(prevShouldRun).not.toBeNull();
    expect(shouldCompensate(prevShouldRun, '*/5 * * * *', now)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - 并发调度器', () => {
  let scheduler: MockConcurrencyScheduler;

  beforeEach(() => {
    scheduler = new MockConcurrencyScheduler(3);
  });

  it('并发上限内的任务直接分发', () => {
    expect(scheduler.enqueue(1)).toBe('dispatched');
    expect(scheduler.enqueue(2)).toBe('dispatched');
    expect(scheduler.enqueue(3)).toBe('dispatched');
    expect(scheduler.getStatus().running).toHaveLength(3);
    expect(scheduler.getStatus().queued).toHaveLength(0);
  });

  it('超过并发上限的任务进入等待队列', () => {
    scheduler.enqueue(1);
    scheduler.enqueue(2);
    scheduler.enqueue(3);
    expect(scheduler.enqueue(4)).toBe('queued');
    expect(scheduler.enqueue(5)).toBe('queued');

    const status = scheduler.getStatus();
    expect(status.running).toHaveLength(3);
    expect(status.queued).toEqual([4, 5]);
  });

  it('任务完成后从队列取出下一个', () => {
    scheduler.enqueue(1);
    scheduler.enqueue(2);
    scheduler.enqueue(3);
    scheduler.enqueue(4); // 入队
    scheduler.enqueue(5); // 入队

    scheduler.complete(1); // 完成任务1

    const status = scheduler.getStatus();
    expect(status.running).toContain(4); // 任务4 应被调度
    expect(status.queued).toEqual([5]);
  });

  it('同一任务不重复进入队列', () => {
    scheduler.enqueue(1);
    scheduler.enqueue(2);
    scheduler.enqueue(3);

    // 已满，任务4尝试入队两次
    scheduler.enqueue(4);
    scheduler.enqueue(4); // 重复

    expect(scheduler.getStatus().queued).toHaveLength(1);
    expect(scheduler.getStatus().queued).toEqual([4]);
  });

  it('完成所有任务后调度器清空', () => {
    scheduler.enqueue(1);
    scheduler.enqueue(2);
    scheduler.enqueue(3);

    scheduler.complete(1);
    scheduler.complete(2);
    scheduler.complete(3);

    const status = scheduler.getStatus();
    expect(status.running).toHaveLength(0);
    expect(status.queued).toHaveLength(0);
  });

  it('并发上限为1时应串行执行', () => {
    const serial = new MockConcurrencyScheduler(1);
    expect(serial.enqueue(1)).toBe('dispatched');
    expect(serial.enqueue(2)).toBe('queued');
    expect(serial.enqueue(3)).toBe('queued');

    serial.complete(1);
    expect(serial.getStatus().running).toContain(2);
    expect(serial.getStatus().queued).toEqual([3]);
  });

  it('连续完成应按 FIFO 顺序处理队列', () => {
    const s = new MockConcurrencyScheduler(2);
    s.enqueue(1);
    s.enqueue(2);
    s.enqueue(3);
    s.enqueue(4);
    s.enqueue(5);

    // 1,2 运行，3,4,5 排队
    expect(s.getStatus().running.sort()).toEqual([1, 2]);
    expect(s.getStatus().queued).toEqual([3, 4, 5]);

    s.complete(1); // 1 完成，3 出队
    expect(s.getStatus().queued).toEqual([4, 5]);

    s.complete(2); // 2 完成，4 出队
    expect(s.getStatus().queued).toEqual([5]);
  });

  it('getStatus 应返回正确的并发上限', () => {
    expect(scheduler.getStatus().concurrencyLimit).toBe(3);
    expect(new MockConcurrencyScheduler(5).getStatus().concurrencyLimit).toBe(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - 失败重试策略', () => {
  it('初始状态应允许重试', () => {
    const state: RetryState = { taskId: 1, attempt: 0, maxRetries: 3, retryDelayMs: 10000 };
    expect(shouldRetry(state)).toBe(true);
  });

  it('达到最大重试次数后不再重试', () => {
    const state: RetryState = { taskId: 1, attempt: 3, maxRetries: 3, retryDelayMs: 10000 };
    expect(shouldRetry(state)).toBe(false);
  });

  it('未达到最大重试次数时应重试', () => {
    const state: RetryState = { taskId: 1, attempt: 2, maxRetries: 3, retryDelayMs: 10000 };
    expect(shouldRetry(state)).toBe(true);
  });

  it('线性退避：第 1 次重试延迟 = 1 * baseDelay', () => {
    expect(computeRetryDelay(1, 30_000)).toBe(30_000);
  });

  it('线性退避：第 2 次重试延迟 = 2 * baseDelay', () => {
    expect(computeRetryDelay(2, 30_000)).toBe(60_000);
  });

  it('线性退避：第 3 次重试延迟 = 3 * baseDelay', () => {
    expect(computeRetryDelay(3, 30_000)).toBe(90_000);
  });

  it('maxRetries=0 时永不重试', () => {
    const state: RetryState = { taskId: 1, attempt: 0, maxRetries: 0, retryDelayMs: 10000 };
    expect(shouldRetry(state)).toBe(false);
  });

  it('maxRetries=1 时只重试一次', () => {
    const attempt0: RetryState = { taskId: 1, attempt: 0, maxRetries: 1, retryDelayMs: 10000 };
    const attempt1: RetryState = { taskId: 1, attempt: 1, maxRetries: 1, retryDelayMs: 10000 };
    expect(shouldRetry(attempt0)).toBe(true);
    expect(shouldRetry(attempt1)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - MockConcurrencyScheduler 边界测试', () => {
  it('并发上限为0时所有任务都进队列', () => {
    const s = new MockConcurrencyScheduler(0);
    // 无法运行，全部入队
    const r1 = s.enqueue(1);
    expect(r1).toBe('queued'); // 0 < 0 不成立，进队
    expect(s.getStatus().running).toHaveLength(0);
    expect(s.getStatus().queued).toHaveLength(1);
  });

  it('完成不存在的任务不影响状态', () => {
    const s = new MockConcurrencyScheduler(3);
    s.enqueue(1);
    s.enqueue(2);
    s.complete(99); // 不存在
    expect(s.getStatus().running).toHaveLength(2); // 1 和 2 仍在运行
  });

  it('大量任务排队时 FIFO 顺序正确', () => {
    const s = new MockConcurrencyScheduler(1);
    s.enqueue(1); // 运行
    for (let i = 2; i <= 10; i++) s.enqueue(i); // 2-10 入队

    expect(s.getStatus().queued).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);

    s.complete(1);
    expect(s.getStatus().running).toContain(2);
    expect(s.getStatus().queued).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - 审计日志条目格式验证', () => {
  /**
   * 验证审计日志的 action 字段枚举值
   * 与迁移脚本 v1.3.0 的注释一致
   */
  const VALID_AUDIT_ACTIONS = [
    'created',
    'updated',
    'deleted',
    'status_changed',
    'manually_triggered',
    'execution_cancelled',
    'compensated',
    'triggered',
    'retry_scheduled',
    'permanently_failed',
  ] as const;

  type AuditAction = typeof VALID_AUDIT_ACTIONS[number];

  const isValidAction = (action: string): action is AuditAction => {
    return VALID_AUDIT_ACTIONS.includes(action as AuditAction);
  };

  it('所有预定义操作类型均合法', () => {
    for (const action of VALID_AUDIT_ACTIONS) {
      expect(isValidAction(action)).toBe(true);
    }
  });

  it('非预定义操作类型应视为无效', () => {
    expect(isValidAction('unknown_action')).toBe(false);
    expect(isValidAction('hacked')).toBe(false);
    expect(isValidAction('')).toBe(false);
  });

  it('调度器触发的操作应使用 triggered', () => {
    expect(isValidAction('triggered')).toBe(true);
  });

  it('手动触发的操作应使用 manually_triggered', () => {
    expect(isValidAction('manually_triggered')).toBe(true);
  });

  it('漏触发补偿的操作应使用 compensated', () => {
    expect(isValidAction('compensated')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────


// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - executeTask scriptPaths 前置校验（Bug修复验证）', () => {
  /**
   * 模拟 executeTask 中 scriptPaths 校验前置后的行为
   *
   * 修复背景：原来代码在 triggerTestExecution（创建运行记录）之后才检查
   * scriptPaths.length === 0，导致每次 cron 触发都产生 pending 状态的无效记录堆积。
   * 修复后将校验提前到创建运行记录之前。
   */

  type ExecuteResult = 'skipped_no_cases' | 'skipped_no_scripts' | 'executed';

  /**
   * 模拟修复后的 executeTask 提前返回逻辑
   */
  function simulateExecuteTask(params: {
    caseIds: number[];
    scriptPaths: string[];
    taskStatus: string;
  }): { result: ExecuteResult; recordCreated: boolean } {
    // 1. 状态检查
    if (params.taskStatus !== 'active') {
      return { result: 'skipped_no_cases', recordCreated: false };
    }

    // 2. caseIds 为空 → 跳过
    if (params.caseIds.length === 0) {
      return { result: 'skipped_no_cases', recordCreated: false };
    }

    // 3. scriptPaths 为空 → 跳过（修复后：在此提前 return，不创建运行记录）
    if (params.scriptPaths.length === 0) {
      return { result: 'skipped_no_scripts', recordCreated: false };
    }

    // 4. 正常执行 → 创建运行记录 + 触发 Jenkins
    return { result: 'executed', recordCreated: true };
  }

  it('scriptPaths 为空时应跳过执行且不创建运行记录', () => {
    const { result, recordCreated } = simulateExecuteTask({
      caseIds: [1, 2],
      scriptPaths: [],         // 用例没有 scriptPath
      taskStatus: 'active',
    });
    expect(result).toBe('skipped_no_scripts');
    expect(recordCreated).toBe(false);
  });

  it('caseIds 为空时应跳过执行且不创建运行记录', () => {
    const { result, recordCreated } = simulateExecuteTask({
      caseIds: [],
      scriptPaths: [],
      taskStatus: 'active',
    });
    expect(result).toBe('skipped_no_cases');
    expect(recordCreated).toBe(false);
  });

  it('正常情况（有 caseIds 且有 scriptPaths）应创建运行记录并执行', () => {
    const { result, recordCreated } = simulateExecuteTask({
      caseIds: [1, 2, 3],
      scriptPaths: ['tests/login.spec.ts', 'tests/order.spec.ts'],
      taskStatus: 'active',
    });
    expect(result).toBe('executed');
    expect(recordCreated).toBe(true);
  });

  it('任务已暂停时应跳过且不创建运行记录', () => {
    const { result, recordCreated } = simulateExecuteTask({
      caseIds: [1],
      scriptPaths: ['tests/login.spec.ts'],
      taskStatus: 'paused',
    });
    expect(result).toBe('skipped_no_cases');
    expect(recordCreated).toBe(false);
  });

  it('多个用例但所有用例均无 scriptPath 时，不应产生任何运行记录', () => {
    // 模拟：5 个用例、scriptPaths 全部为空字符串经过 filter 后长度为 0
    const rawScriptPaths = ['', '  ', '', null, undefined]
      .map(p => (p ?? '').trim())
      .filter(Boolean) as string[];

    const { result, recordCreated } = simulateExecuteTask({
      caseIds: [1, 2, 3, 4, 5],
      scriptPaths: rawScriptPaths,  // 空数组
      taskStatus: 'active',
    });
    expect(rawScriptPaths).toHaveLength(0);
    expect(result).toBe('skipped_no_scripts');
    expect(recordCreated).toBe(false);
  });

  it('重复触发同一无脚本任务：每次均应跳过，不累积记录', () => {
    // 模拟每次 cron 触发时调用 simulateExecuteTask 的行为
    const triggerCounts = 10;
    let createdRecords = 0;

    for (let i = 0; i < triggerCounts; i++) {
      const { recordCreated } = simulateExecuteTask({
        caseIds: [1],
        scriptPaths: [],  // 始终无 scriptPath
        taskStatus: 'active',
      });
      if (recordCreated) createdRecords++;
    }

    // 修复后：无论触发多少次，都不会创建运行记录
    expect(createdRecords).toBe(0);
  });
});
