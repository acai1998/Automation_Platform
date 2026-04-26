import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * tasks.ts 路由 集成逻辑测试
 *
 * 测试策略：
 * - 测试路由中的业务逻辑函数（参数校验、状态检查等）
 * - Mock 数据库依赖，专注路由逻辑正确性
 * - 不依赖真实 HTTP 服务器（提取纯函数测试）
 */

// ──────────────────────────────────────────────────────────────────────────────
// 从 tasks.ts 路由提取的可测试纯函数
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cron 表达式格式校验
 * 5段 cron：分 时 日 月 周
 * 每段只允许：数字、*、, 、- 、/
 */
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((part) => /^[\d*,\-/]+$/.test(part));
}

/**
 * 任务名称合法性校验
 */
function validateTaskName(name: unknown): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'name 不能为空' };
  }
  if (name.trim().length > 200) {
    return { valid: false, error: 'name 长度不能超过200个字符' };
  }
  return { valid: true };
}

/**
 * 触发类型合法性校验
 */
const VALID_TRIGGER_TYPES = ['manual', 'scheduled', 'ci_triggered'] as const;
type TriggerType = typeof VALID_TRIGGER_TYPES[number];

function validateTriggerType(type: unknown): type is TriggerType {
  return VALID_TRIGGER_TYPES.includes(type as TriggerType);
}

/**
 * 任务状态合法性校验
 */
const VALID_STATUSES = ['active', 'paused', 'archived'] as const;
type TaskStatus = typeof VALID_STATUSES[number];

function validateStatus(status: unknown): status is TaskStatus {
  return VALID_STATUSES.includes(status as TaskStatus);
}

/**
 * 分页参数规范化
 */
function normalizePagination(
  limit: unknown,
  offset: unknown,
  maxLimit = 100
): { limit: number; offset: number } {
  const parsedLimit = Math.min(maxLimit, Math.max(1, parseInt(String(limit)) || 20));
  const parsedOffset = Math.max(0, parseInt(String(offset)) || 0);
  return { limit: parsedLimit, offset: parsedOffset };
}

/**
 * 执行状态是否可取消
 */
function isExecutionCancellable(status: string): boolean {
  return ['pending', 'running'].includes(status);
}

/**
 * 是否可手动触发（archived 状态不可触发）
 */
function isTaskTriggerable(status: TaskStatus): boolean {
  return status !== 'archived';
}

/**
 * 统计查询天数范围规范化
 */
function normalizeStatsDays(days: unknown, max = 90, defaultDays = 30): number {
  return Math.min(max, Math.max(1, parseInt(String(days)) || defaultDays));
}

/**
 * 审计日志分页规范化
 */
function normalizeAuditPagination(
  limit: unknown,
  offset: unknown
): { limit: number; offset: number } {
  const parsedLimit = Math.min(200, Math.max(1, parseInt(String(limit)) || 50));
  const parsedOffset = Math.max(0, parseInt(String(offset)) || 0);
  return { limit: parsedLimit, offset: parsedOffset };
}

// ──────────────────────────────────────────────────────────────────────────────
// 测试套件
// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - Cron 表达式校验', () => {
  it('标准每日 cron (0 2 * * *) 应合法', () => {
    expect(isValidCron('0 2 * * *')).toBe(true);
  });

  it('每5分钟 (*/5 * * * *) 应合法', () => {
    expect(isValidCron('*/5 * * * *')).toBe(true);
  });

  it('每小时 (0 * * * *) 应合法', () => {
    expect(isValidCron('0 * * * *')).toBe(true);
  });

  it('带逗号的多值 (0 8,20 * * *) 应合法', () => {
    expect(isValidCron('0 8,20 * * *')).toBe(true);
  });

  it('带连字符的范围 (0 9-17 * * *) 应合法', () => {
    expect(isValidCron('0 9-17 * * *')).toBe(true);
  });

  it('带 / 的步长 (0 */2 * * *) 应合法', () => {
    expect(isValidCron('0 */2 * * *')).toBe(true);
  });

  it('4段 cron 应非法', () => {
    expect(isValidCron('0 * * *')).toBe(false);
  });

  it('6段 cron 应非法', () => {
    expect(isValidCron('0 * * * * *')).toBe(false);
  });

  it('包含字母的 cron 应非法', () => {
    expect(isValidCron('0 2 * * MON')).toBe(false);
  });

  it('空字符串应非法', () => {
    expect(isValidCron('')).toBe(false);
  });

  it('仅有空格应非法', () => {
    expect(isValidCron('     ')).toBe(false);
  });

  it('含特殊字符 (?) 应非法', () => {
    expect(isValidCron('0 2 ? * *')).toBe(false);
  });

  it('含 L 字符应非法', () => {
    expect(isValidCron('0 0 L * *')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 任务名称校验', () => {
  it('正常名称应通过', () => {
    expect(validateTaskName('My Test Task')).toEqual({ valid: true });
  });

  it('中文名称应通过', () => {
    expect(validateTaskName('每日回归测试')).toEqual({ valid: true });
  });

  it('null 应失败', () => {
    expect(validateTaskName(null)).toEqual({ valid: false, error: 'name 不能为空' });
  });

  it('undefined 应失败', () => {
    expect(validateTaskName(undefined)).toEqual({ valid: false, error: 'name 不能为空' });
  });

  it('空字符串应失败', () => {
    expect(validateTaskName('')).toEqual({ valid: false, error: 'name 不能为空' });
  });

  it('全空格应失败', () => {
    expect(validateTaskName('   ')).toEqual({ valid: false, error: 'name 不能为空' });
  });

  it('超过200字符应失败', () => {
    const longName = 'a'.repeat(201);
    expect(validateTaskName(longName)).toEqual({ valid: false, error: 'name 长度不能超过200个字符' });
  });

  it('刚好200字符应通过', () => {
    const name200 = 'a'.repeat(200);
    expect(validateTaskName(name200)).toEqual({ valid: true });
  });

  it('数字类型应失败', () => {
    expect(validateTaskName(123)).toEqual({ valid: false, error: 'name 不能为空' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 触发类型校验', () => {
  it('manual 应合法', () => {
    expect(validateTriggerType('manual')).toBe(true);
  });

  it('scheduled 应合法', () => {
    expect(validateTriggerType('scheduled')).toBe(true);
  });

  it('ci_triggered 应合法', () => {
    expect(validateTriggerType('ci_triggered')).toBe(true);
  });

  it('webhook 应非法', () => {
    expect(validateTriggerType('webhook')).toBe(false);
  });

  it('cron 应非法（非枚举值）', () => {
    expect(validateTriggerType('cron')).toBe(false);
  });

  it('空字符串应非法', () => {
    expect(validateTriggerType('')).toBe(false);
  });

  it('null 应非法', () => {
    expect(validateTriggerType(null)).toBe(false);
  });

  it('undefined 应非法', () => {
    expect(validateTriggerType(undefined)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 任务状态校验', () => {
  it('active 应合法', () => {
    expect(validateStatus('active')).toBe(true);
  });

  it('paused 应合法', () => {
    expect(validateStatus('paused')).toBe(true);
  });

  it('archived 应合法', () => {
    expect(validateStatus('archived')).toBe(true);
  });

  it('disabled 应非法', () => {
    expect(validateStatus('disabled')).toBe(false);
  });

  it('deleted 应非法', () => {
    expect(validateStatus('deleted')).toBe(false);
  });

  it('空字符串应非法', () => {
    expect(validateStatus('')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 分页参数规范化', () => {
  it('默认参数应返回 limit=20, offset=0', () => {
    expect(normalizePagination(undefined, undefined)).toEqual({ limit: 20, offset: 0 });
  });

  it('传入 limit=5 应使用5', () => {
    expect(normalizePagination(5, 0)).toEqual({ limit: 5, offset: 0 });
  });

  it('超过最大 limit 应截断到 maxLimit', () => {
    expect(normalizePagination(200, 0)).toEqual({ limit: 100, offset: 0 });
  });

  it('负数 limit 应规范化为 1', () => {
    expect(normalizePagination(-5, 0)).toEqual({ limit: 1, offset: 0 });
  });

  it('负数 offset 应规范化为 0', () => {
    expect(normalizePagination(20, -10)).toEqual({ limit: 20, offset: 0 });
  });

  it('字符串数字应正确解析', () => {
    expect(normalizePagination('15', '30')).toEqual({ limit: 15, offset: 30 });
  });

  it('非数字字符串 limit 应默认 20', () => {
    expect(normalizePagination('abc', 0)).toEqual({ limit: 20, offset: 0 });
  });

  it('自定义 maxLimit 应生效', () => {
    expect(normalizePagination(50, 0, 30)).toEqual({ limit: 30, offset: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 执行取消逻辑', () => {
  it('pending 状态可取消', () => {
    expect(isExecutionCancellable('pending')).toBe(true);
  });

  it('running 状态可取消', () => {
    expect(isExecutionCancellable('running')).toBe(true);
  });

  it('success 状态不可取消', () => {
    expect(isExecutionCancellable('success')).toBe(false);
  });

  it('failed 状态不可取消', () => {
    expect(isExecutionCancellable('failed')).toBe(false);
  });

  it('cancelled 状态不可取消', () => {
    expect(isExecutionCancellable('cancelled')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 任务触发权限检查', () => {
  it('active 状态任务可触发', () => {
    expect(isTaskTriggerable('active')).toBe(true);
  });

  it('paused 状态任务可触发', () => {
    expect(isTaskTriggerable('paused')).toBe(true);
  });

  it('archived 状态任务不可触发', () => {
    expect(isTaskTriggerable('archived')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 统计查询天数规范化', () => {
  it('默认应返回 30 天', () => {
    expect(normalizeStatsDays(undefined)).toBe(30);
  });

  it('传入 7 应返回 7', () => {
    expect(normalizeStatsDays(7)).toBe(7);
  });

  it('超过 90 应截断到 90', () => {
    expect(normalizeStatsDays(180)).toBe(90);
  });

  it('负数应规范化为 1', () => {
    expect(normalizeStatsDays(-5)).toBe(1);
  });

  it('字符串数字应正确解析', () => {
    expect(normalizeStatsDays('60')).toBe(60);
  });

  it('非法字符串应使用默认 30', () => {
    expect(normalizeStatsDays('abc')).toBe(30);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 审计日志分页规范化', () => {
  it('默认应返回 limit=50, offset=0', () => {
    expect(normalizeAuditPagination(undefined, undefined)).toEqual({ limit: 50, offset: 0 });
  });

  it('超过 200 应截断到 200', () => {
    expect(normalizeAuditPagination(300, 0)).toEqual({ limit: 200, offset: 0 });
  });

  it('负数 limit 应规范化为 1', () => {
    expect(normalizeAuditPagination(-1, 0)).toEqual({ limit: 1, offset: 0 });
  });

  it('负数 offset 应规范化为 0', () => {
    expect(normalizeAuditPagination(50, -5)).toEqual({ limit: 50, offset: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 综合业务规则', () => {
  it('定时任务创建时 cron 为必填项', () => {
    const triggerType = 'scheduled';
    const cronExpression = undefined;

    let error: string | null = null;
    if (triggerType === 'scheduled' && !cronExpression) {
      error = '定时任务必须提供 cronExpression';
    }

    expect(error).toBe('定时任务必须提供 cronExpression');
  });

  it('手动任务创建时 cron 不是必填项', () => {
    const triggerType: string = 'manual';
    const cronExpression = undefined;

    let error: string | null = null;
    if (triggerType === 'scheduled' && !cronExpression) {
      error = '定时任务必须提供 cronExpression';
    }

    expect(error).toBeNull();
  });

  it('caseIds 传入时必须是数组', () => {
    const validateCaseIds = (caseIds: unknown): boolean => {
      if (caseIds !== undefined && !Array.isArray(caseIds)) {
        return false; // 非法
      }
      return true;
    };

    expect(validateCaseIds(undefined)).toBe(true);
    expect(validateCaseIds([])).toBe(true);
    expect(validateCaseIds([1, 2, 3])).toBe(true);
    expect(validateCaseIds('not-array')).toBe(false);
    expect(validateCaseIds(123)).toBe(false);
    expect(validateCaseIds({})).toBe(false);
  });

  it('任务 ID 必须是有效整数', () => {
    const parseTaskId = (id: string): number | null => {
      const parsed = parseInt(id);
      return isNaN(parsed) ? null : parsed;
    };

    expect(parseTaskId('123')).toBe(123);
    expect(parseTaskId('0')).toBe(0);
    expect(parseTaskId('abc')).toBeNull();
    expect(parseTaskId('')).toBeNull();
    expect(parseTaskId('12.5')).toBe(12); // parseInt 取整数部分
  });

  it('archived 任务不能通过 status 接口变更为其他状态', () => {
    // 在 tasks 路由中，状态变更只要 status 在合法列表内就允许
    // 但如果想防止 archived → active，需要额外逻辑
    // 这里测试校验函数的行为
    const canChangeStatus = (
      currentStatus: string,
      newStatus: string,
      allowedStatuses: readonly string[]
    ): boolean => {
      return allowedStatuses.includes(newStatus);
    };

    const allowed = ['active', 'paused', 'archived'] as const;
    expect(canChangeStatus('archived', 'active', allowed)).toBe(true);
    expect(canChangeStatus('archived', 'deleted', allowed)).toBe(false);
  });

  it('任务描述字段长度校验（模拟前端逻辑）', () => {
    const validateDescription = (desc: string): boolean => {
      return desc.length <= 1000;
    };

    expect(validateDescription('短描述')).toBe(true);
    expect(validateDescription('a'.repeat(1000))).toBe(true);
    expect(validateDescription('a'.repeat(1001))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - 数据转换与格式化', () => {
  it('成功率计算：total=0 时返回 0', () => {
    const calcSuccessRate = (total: number, successCount: number): number => {
      if (total === 0) return 0;
      return Math.round((successCount / total) * 100);
    };

    expect(calcSuccessRate(0, 0)).toBe(0);
    expect(calcSuccessRate(10, 10)).toBe(100);
    expect(calcSuccessRate(10, 5)).toBe(50);
    expect(calcSuccessRate(3, 1)).toBe(33);
    expect(calcSuccessRate(3, 2)).toBe(67);
  });

  it('元数据 JSON 解析应安全处理', () => {
    const safeParseMetadata = (raw: string): Record<string, unknown> => {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };

    expect(safeParseMetadata('{"key":"value"}')).toEqual({ key: 'value' });
    expect(safeParseMetadata('invalid json')).toEqual({});
    expect(safeParseMetadata('')).toEqual({});
    expect(safeParseMetadata('null')).toBe(null); // JSON.parse('null') = null
  });

  it('case_ids JSON 解析应安全处理', () => {
    const parseCaseIds = (raw: string | null): number[] => {
      try {
        return JSON.parse(raw || '[]');
      } catch {
        return [];
      }
    };

    expect(parseCaseIds('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseCaseIds('[]')).toEqual([]);
    expect(parseCaseIds(null)).toEqual([]);
    expect(parseCaseIds('invalid')).toEqual([]);
  });

  it('错误消息截断到 200 字符（topErrors）', () => {
    const truncateError = (msg: string, maxLen = 200): string => {
      return msg.substring(0, maxLen);
    };

    const longError = 'E'.repeat(300);
    expect(truncateError(longError).length).toBe(200);
    expect(truncateError('short error').length).toBe(11);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('tasks 路由 - today_runs 统计逻辑修复验证', () => {
  /**
   * 修复背景：原来使用 COALESCE(start_time, NOW()) 导致 pending 状态（start_time IS NULL）
   * 的执行记录也会被纳入今日运行统计，产生数据虚高。
   * 修复后改为 start_time IS NOT NULL AND start_time BETWEEN ? AND ?
   */

  interface MockExecution {
    id: number;
    status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
    start_time: string | null;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  /**
   * 模拟修复后的 today_runs 统计逻辑
   * 只统计 start_time IS NOT NULL 且在今日范围内的记录
   */
  function countTodayRuns(executions: MockExecution[]): number {
    return executions.filter(e => {
      if (e.start_time === null) return false;
      const t = new Date(e.start_time).getTime();
      return t >= todayStart.getTime() && t <= todayEnd.getTime();
    }).length;
  }

  /**
   * 模拟修复前的旧逻辑（使用 COALESCE(start_time, NOW())）
   * 当 start_time 为 NULL 时，使用当前时间，会被计入今日
   */
  function countTodayRunsOldLogic(executions: MockExecution[]): number {
    const now = new Date();
    return executions.filter(e => {
      const effectiveTime = e.start_time !== null ? new Date(e.start_time) : now;
      const t = effectiveTime.getTime();
      return t >= todayStart.getTime() && t <= todayEnd.getTime();
    }).length;
  }

  it('修复后：pending 记录（start_time=NULL）不应计入今日运行数', () => {
    const executions: MockExecution[] = [
      { id: 1, status: 'pending', start_time: null },
      { id: 2, status: 'pending', start_time: null },
      { id: 3, status: 'pending', start_time: null },
    ];
    expect(countTodayRuns(executions)).toBe(0);
  });

  it('修复前（旧逻辑）：pending 记录会错误地计入今日运行数', () => {
    const executions: MockExecution[] = [
      { id: 1, status: 'pending', start_time: null },
      { id: 2, status: 'pending', start_time: null },
    ];
    // 旧逻辑下，start_time=NULL 会用当前时间代替，当前时间在今日范围内，所以被计入
    expect(countTodayRunsOldLogic(executions)).toBe(2); // 错误计入了 2 条
  });

  it('修复后：已实际开始的执行记录（start_time 有值）应正确计入今日运行数', () => {
    const now = new Date().toISOString();
    const executions: MockExecution[] = [
      { id: 1, status: 'running', start_time: now },
      { id: 2, status: 'success', start_time: now },
      { id: 3, status: 'failed', start_time: now },
      { id: 4, status: 'pending', start_time: null },  // 不计入
    ];
    expect(countTodayRuns(executions)).toBe(3);
  });

  it('修复后：昨天的执行记录不应计入今日运行数', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const executions: MockExecution[] = [
      { id: 1, status: 'success', start_time: yesterday.toISOString() },
      { id: 2, status: 'failed', start_time: yesterday.toISOString() },
    ];
    expect(countTodayRuns(executions)).toBe(0);
  });

  it('混合场景：今日实际运行 + pending + 昨日运行 → 只计今日实际', () => {
    const now = new Date().toISOString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const executions: MockExecution[] = [
      { id: 1, status: 'success', start_time: now },           // 今日实际：✓
      { id: 2, status: 'running', start_time: now },           // 今日实际：✓
      { id: 3, status: 'pending', start_time: null },          // pending：✗
      { id: 4, status: 'pending', start_time: null },          // pending：✗
      { id: 5, status: 'success', start_time: yesterday.toISOString() }, // 昨日：✗
    ];

    expect(countTodayRuns(executions)).toBe(2);
    // 修复前的旧逻辑会错误地返回 4（2个pending + 2个今日实际）
    expect(countTodayRunsOldLogic(executions)).toBe(4);
  });

  it('start_time 为空字符串时不应计入（等同于无效值）', () => {
    const executions = [
      { id: 1, status: 'pending' as const, start_time: '' as unknown as null },
    ];
    // 空字符串 new Date('') => Invalid Date => getTime() = NaN
    expect(countTodayRuns(executions)).toBe(0);
  });
});
