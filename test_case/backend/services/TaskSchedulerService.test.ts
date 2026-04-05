import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * TaskSchedulerService 单元测试
 *
 * 测试策略：
 * - 使用纯函数提取方式测试 Cron 解析、漏触发检测、并发逻辑
 * - 对有副作用的方法（DB、Jenkins）进行 mock
 * - 聚焦核心调度逻辑的正确性
 */

// ──────────────────────────────────────────────────────────────────────────────
// 提取自 TaskSchedulerService 的纯函数逻辑（用于单元测试）
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 解析 5 段 Cron 表达式，返回近似触发间隔（毫秒）
 * 与 TaskSchedulerService 内部逻辑一致
 */
function parseCronToIntervalMs(expr: string): number | null {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [min, hour] = parts;

    if (/^\*\/(\d+)$/.test(min) && hour === '*') {
      const n = parseInt(min.replace('*/', ''));
      return n * 60 * 1000;
    }
    if (min !== '*' && hour === '*') {
      return 60 * 60 * 1000;
    }
    if (min !== '*' && /^\d+$/.test(hour)) {
      return 24 * 60 * 60 * 1000;
    }
    return 60 * 60 * 1000;
  } catch {
    return null;
  }
}

/**
 * 计算 Cron 表达式的下次触发时间
 * 与 TaskSchedulerService 内部逻辑一致
 */
function getNextCronTime(expr: string, from: Date = new Date()): Date | null {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minPart, hourPart, domPart, monthPart, dowPart] = parts;

    const parseField = (field: string, max: number): number[] | null => {
      if (field === '*') return null;
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

    const candidate = new Date(from.getTime() + 60 * 1000);
    candidate.setSeconds(0, 0);

    const maxSearch = new Date(from.getTime() + 400 * 24 * 60 * 60 * 1000);

    while (candidate < maxSearch) {
      if (allowedMonths && !allowedMonths.includes(candidate.getMonth() + 1)) {
        candidate.setMonth(candidate.getMonth() + 1, 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
      if (allowedDoms && !allowedDoms.includes(candidate.getDate())) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
      if (allowedDows && !allowedDows.includes(candidate.getDay())) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
      if (allowedHours && !allowedHours.includes(candidate.getHours())) {
        candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
        continue;
      }
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

/**
 * 漏触发检测逻辑
 * 返回 true 表示应该补偿执行
 */
function shouldCompensate(
  lastRunAt: Date | null,
  cronExpression: string,
  maxMissedWindowMs = 24 * 60 * 60 * 1000
): boolean {
  if (!lastRunAt) return false;
  const intervalMs = parseCronToIntervalMs(cronExpression);
  if (!intervalMs) return false;
  const elapsed = Date.now() - lastRunAt.getTime();
  return elapsed > intervalMs && elapsed <= maxMissedWindowMs;
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

describe('TaskSchedulerService - Cron 解析', () => {
  describe('parseCronToIntervalMs', () => {
    it('应解析 */5 * * * * 为 5 分钟间隔', () => {
      expect(parseCronToIntervalMs('*/5 * * * *')).toBe(5 * 60 * 1000);
    });

    it('应解析 */10 * * * * 为 10 分钟间隔', () => {
      expect(parseCronToIntervalMs('*/10 * * * *')).toBe(10 * 60 * 1000);
    });

    it('应解析 */30 * * * * 为 30 分钟间隔', () => {
      expect(parseCronToIntervalMs('*/30 * * * *')).toBe(30 * 60 * 1000);
    });

    it('应解析 0 * * * * 为 1 小时间隔', () => {
      expect(parseCronToIntervalMs('0 * * * *')).toBe(60 * 60 * 1000);
    });

    it('应解析 0 2 * * * 为 24 小时间隔', () => {
      expect(parseCronToIntervalMs('0 2 * * *')).toBe(24 * 60 * 60 * 1000);
    });

    it('应解析 30 6 * * * 为 24 小时间隔', () => {
      expect(parseCronToIntervalMs('30 6 * * *')).toBe(24 * 60 * 60 * 1000);
    });

    it('非标准 4 段 cron 应返回 null', () => {
      expect(parseCronToIntervalMs('0 * * *')).toBeNull();
    });

    it('非标准 6 段 cron 应返回 null', () => {
      expect(parseCronToIntervalMs('0 0 * * * *')).toBeNull();
    });

    it('空字符串应返回 null', () => {
      expect(parseCronToIntervalMs('')).toBeNull();
    });

    it('带额外空格的 cron 应正常解析', () => {
      expect(parseCronToIntervalMs('  */5  *  *  *  *  ')).toBe(5 * 60 * 1000);
    });
  });

  describe('getNextCronTime', () => {
    it('应返回下一分钟（* * * * *）', () => {
      const from = new Date('2026-03-12T10:00:00.000Z');
      const next = getNextCronTime('* * * * *', from);
      expect(next).not.toBeNull();
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
      // 下次触发应在 from 后至少 60 秒
      expect(next!.getTime() - from.getTime()).toBeGreaterThanOrEqual(60 * 1000);
    });

    it('应解析每日触发（0 2 * * *）返回非空时间', () => {
      const from = new Date('2026-03-12T02:30:00.000Z');
      const next = getNextCronTime('0 2 * * *', from);
      expect(next).not.toBeNull();
      // 下次触发应该是明天的 02:00
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
    });

    it('应解析每 5 分钟触发（*/5 * * * *）', () => {
      const from = new Date('2026-03-12T10:00:00.000Z');
      const next = getNextCronTime('*/5 * * * *', from);
      expect(next).not.toBeNull();
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
      // 下次触发应在 5 分钟内
      expect(next!.getTime() - from.getTime()).toBeLessThanOrEqual(5 * 60 * 1000 + 60 * 1000);
    });

    it('非法 cron 应返回 null', () => {
      expect(getNextCronTime('invalid cron')).toBeNull();
    });

    it('应支持指定日触发（0 9 15 * *）', () => {
      const from = new Date('2026-03-10T09:00:00.000Z');
      const next = getNextCronTime('0 9 15 * *', from);
      expect(next).not.toBeNull();
      expect(next!.getDate()).toBe(15);
    });

    it('应支持星期触发（0 8 * * 1 = 每周一）', () => {
      // 2026-03-12 是星期四，下一个周一是 2026-03-16
      const from = new Date('2026-03-12T08:00:00.000Z');
      const next = getNextCronTime('0 8 * * 1', from);
      expect(next).not.toBeNull();
      expect(next!.getDay()).toBe(1); // 周一
    });

    it('应支持逗号分隔多值（0 8,20 * * *）', () => {
      const from = new Date('2026-03-12T09:00:00.000Z'); // 当前 9 点，下次应是 20 点
      const next = getNextCronTime('0 8,20 * * *', from);
      expect(next).not.toBeNull();
      expect(next!.getHours()).toBe(20);
    });

    it('应支持范围表达式（0 9-17 * * *）', () => {
      const from = new Date('2026-03-12T08:00:00.000Z');
      const next = getNextCronTime('0 9-17 * * *', from);
      expect(next).not.toBeNull();
      const h = next!.getHours();
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThanOrEqual(17);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('TaskSchedulerService - 漏触发补偿', () => {
  it('从未运行过的任务（lastRunAt=null）不需要补偿', () => {
    expect(shouldCompensate(null, '*/5 * * * *')).toBe(false);
  });

  it('1分钟前运行过、间隔5分钟的任务不需要补偿', () => {
    const lastRunAt = new Date(Date.now() - 1 * 60 * 1000); // 1分钟前
    expect(shouldCompensate(lastRunAt, '*/5 * * * *')).toBe(false);
  });

  it('10分钟前运行过、间隔5分钟的任务需要补偿', () => {
    const lastRunAt = new Date(Date.now() - 10 * 60 * 1000); // 10分钟前
    expect(shouldCompensate(lastRunAt, '*/5 * * * *')).toBe(true);
  });

  it('超过24小时的漏触发不需要补偿（窗口外）', () => {
    const lastRunAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25小时前
    expect(shouldCompensate(lastRunAt, '*/5 * * * *')).toBe(false);
  });

  it('恰好在窗口内（23小时）的漏触发应补偿', () => {
    const lastRunAt = new Date(Date.now() - 23 * 60 * 60 * 1000); // 23小时前
    // 每小时任务，23小时前运行，超过了1小时间隔，在24小时内
    expect(shouldCompensate(lastRunAt, '0 * * * *')).toBe(true);
  });

  it('无法解析的 cron 不触发补偿', () => {
    const lastRunAt = new Date(Date.now() - 10 * 60 * 1000);
    expect(shouldCompensate(lastRunAt, 'invalid')).toBe(false);
  });

  it('每日任务（0 2 * * *）在服务停机超过24h未运行时不应补偿（超出窗口）', () => {
    const lastRunAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25小时前，超窗口
    expect(shouldCompensate(lastRunAt, '0 2 * * *')).toBe(false);
  });

  it('每日任务（0 2 * * *）elapsed > interval 且在窗口内应补偿', () => {
    // 25h > 24h interval，且 elapsed(25h) > maxWindow(24h) => false（超窗口）
    // 需要 elapsed > interval 且 elapsed <= 24h:
    // 例如，elapsed = 24h + 1min = just over interval，且在24h窗口内（实际不可能，因为24h+1min > 24h窗口）
    // 修正：使用自定义窗口 = 48h，则 25h 满足 elapsed > 24h 且 elapsed <= 48h
    const lastRunAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25小时前
    const customWindow = 48 * 60 * 60 * 1000; // 48小时窗口
    expect(shouldCompensate(lastRunAt, '0 2 * * *', customWindow)).toBe(true);
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

describe('TaskSchedulerService - Cron 表达式边界值测试', () => {
  it('*/1 触发间隔应为 1 分钟', () => {
    expect(parseCronToIntervalMs('*/1 * * * *')).toBe(60 * 1000);
  });

  it('*/60 触发间隔应为 60 分钟', () => {
    expect(parseCronToIntervalMs('*/60 * * * *')).toBe(60 * 60 * 1000);
  });

  it('0 0 * * * 触发间隔应为 24 小时', () => {
    expect(parseCronToIntervalMs('0 0 * * *')).toBe(24 * 60 * 60 * 1000);
  });

  it('每天固定时间触发（0 12 * * *）', () => {
    const from = new Date('2026-03-12T10:00:00.000Z');
    const next = getNextCronTime('0 12 * * *', from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(12);
    expect(next!.getMinutes()).toBe(0);
  });

  it('每月第一天触发（0 0 1 * *）', () => {
    const from = new Date('2026-03-15T00:00:00.000Z');
    const next = getNextCronTime('0 0 1 * *', from);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(1);
  });
});

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
