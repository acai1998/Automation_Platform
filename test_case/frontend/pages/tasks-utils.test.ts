import { describe, it, expect } from 'vitest';

/**
 * Tasks.tsx 工具函数单元测试
 *
 * 测试策略：
 * - 提取 Tasks.tsx 中的纯函数逻辑，独立测试
 * - 不依赖 jsdom / react-testing-library（纯 TS 环境）
 * - 快速验证本次修复的核心逻辑
 */

// ──────────────────────────────────────────────────────────────────────────────
// 提取自 Tasks.tsx 的纯函数（与页面代码逻辑保持一致）
// ──────────────────────────────────────────────────────────────────────────────

interface Execution {
  id: number;
  status: string;
  start_time?: string | null;
  passed_cases?: number;
  failed_cases?: number;
  total_cases?: number;
}

interface Task {
  id: number;
  status: string;
  recentExecutions: Execution[];
}

interface SemanticStatus {
  key: string;
  label: string;
}

/**
 * 与 Tasks.tsx 中 getTaskSemanticStatus 完全一致的逻辑（修复后版本）
 */
function getTaskSemanticStatus(task: Task): SemanticStatus {
  const latest = task.recentExecutions?.[0];

  if (task.status === 'paused') return { key: 'paused', label: '暂停' };
  if (latest?.status === 'running') return { key: 'running', label: '运行中' };
  if (latest?.status === 'pending') return { key: 'pending', label: '排队中' };
  if (latest?.status === 'failed') return { key: 'failed', label: '失败' };
  // 从未执行过时（latest 为空），显示"空闲"而非"成功"，避免语义误导
  if (!latest) return { key: 'draft', label: '空闲' };
  return { key: 'success', label: '成功' };
}

/**
 * 与 Tasks.tsx 中 formatTime 完全一致的逻辑（修复后版本）
 */
function formatTime(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * failedTaskIds 安全访问（修复后版本）
 */
function buildFailureDescription(failedTaskIds: number[] | undefined): string {
  const failedIds = failedTaskIds ?? [];
  const previewFailedIds = failedIds.slice(0, 5).join(', ');
  const hasMore = failedIds.length > 5;
  return failedIds.length > 0
    ? `失败任务ID: ${previewFailedIds}${hasMore ? ' ...' : ''}`
    : '请重试或查看后端日志';
}

// ──────────────────────────────────────────────────────────────────────────────

describe('Tasks.tsx - getTaskSemanticStatus（空闲态修复）', () => {
  it('active 任务从未执行过时应返回"空闲"', () => {
    const task: Task = { id: 1, status: 'active', recentExecutions: [] };
    const result = getTaskSemanticStatus(task);
    expect(result.key).toBe('draft');
    expect(result.label).toBe('空闲');
  });

  it('active 任务最近一次执行成功时应返回"成功"', () => {
    const task: Task = {
      id: 1,
      status: 'active',
      recentExecutions: [{ id: 1, status: 'success' }],
    };
    const result = getTaskSemanticStatus(task);
    expect(result.key).toBe('success');
    expect(result.label).toBe('成功');
  });

  it('active 任务最近一次执行失败时应返回"失败"', () => {
    const task: Task = {
      id: 1,
      status: 'active',
      recentExecutions: [{ id: 1, status: 'failed' }],
    };
    const result = getTaskSemanticStatus(task);
    expect(result.key).toBe('failed');
    expect(result.label).toBe('失败');
  });

  it('paused 任务应返回"暂停"（无论 recentExecutions）', () => {
    const taskEmpty: Task = { id: 1, status: 'paused', recentExecutions: [] };
    const taskWithRun: Task = {
      id: 1,
      status: 'paused',
      recentExecutions: [{ id: 1, status: 'success' }],
    };
    expect(getTaskSemanticStatus(taskEmpty).label).toBe('暂停');
    expect(getTaskSemanticStatus(taskWithRun).label).toBe('暂停');
  });

  it('active 任务正在运行时应返回"运行中"', () => {
    const task: Task = {
      id: 1,
      status: 'active',
      recentExecutions: [{ id: 1, status: 'running' }],
    };
    expect(getTaskSemanticStatus(task).label).toBe('运行中');
  });

  it('active 任务排队中时应返回"排队中"', () => {
    const task: Task = {
      id: 1,
      status: 'active',
      recentExecutions: [{ id: 1, status: 'pending' }],
    };
    expect(getTaskSemanticStatus(task).label).toBe('排队中');
  });

  it('修复前的语义问题：recentExecutions 为空时不应错误地返回"成功"', () => {
    // 这是修复前的 bug：active + no executions => 成功（错误）
    // 修复后应返回：空闲
    const task: Task = { id: 1, status: 'active', recentExecutions: [] };
    const result = getTaskSemanticStatus(task);
    expect(result.label).not.toBe('成功'); // 修复后不再是"成功"
    expect(result.label).toBe('空闲');
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('Tasks.tsx - formatTime（无效日期守护）', () => {
  it('空字符串应返回"-"', () => {
    expect(formatTime('')).toBe('-');
  });

  it('null 应返回"-"', () => {
    expect(formatTime(null)).toBe('-');
  });

  it('undefined 应返回"-"', () => {
    expect(formatTime(undefined)).toBe('-');
  });

  it('非法日期字符串应返回"-"而非"Invalid Date"', () => {
    expect(formatTime('not-a-date')).toBe('-');
    expect(formatTime('invalid')).toBe('-');
    expect(formatTime('2023-13-45')).toBe('-'); // 月份超范围
  });

  it('有效日期字符串不应返回"-"', () => {
    const result = formatTime('2026-01-15T10:30:00Z');
    expect(result).not.toBe('-');
    expect(result).not.toContain('Invalid Date');
  });

  it('修复验证：任何情况下都不应输出"Invalid Date"', () => {
    const testCases = [
      'not-a-valid-date',
      'abc',
      '00/00/0000',
      '',
      null,
      undefined,
    ];
    for (const tc of testCases) {
      const result = formatTime(tc as string);
      expect(result, `formatTime("${tc}") should not be "Invalid Date"`).not.toContain('Invalid Date');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('Tasks.tsx - failedTaskIds 安全访问', () => {
  it('failedTaskIds 为 undefined 时应使用空数组兜底', () => {
    const result = buildFailureDescription(undefined);
    expect(result).toBe('请重试或查看后端日志');
  });

  it('failedTaskIds 为空数组时应显示默认提示', () => {
    const result = buildFailureDescription([]);
    expect(result).toBe('请重试或查看后端日志');
  });

  it('failedTaskIds 有内容时应显示失败任务 ID', () => {
    const result = buildFailureDescription([1, 2, 3]);
    expect(result).toContain('失败任务ID');
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
    expect(result).not.toContain('...');
  });

  it('failedTaskIds 超过5个时应显示省略号', () => {
    const result = buildFailureDescription([1, 2, 3, 4, 5, 6, 7]);
    expect(result).toContain('...');
    // 只展示前5个
    expect(result).toContain('1');
    expect(result).toContain('5');
  });

  it('修复前的潜在 crash：failedTaskIds 为 undefined 时直接 .slice() 会报错', () => {
    // 修复前：result.failedTaskIds.slice(0, 5) 在 failedTaskIds=undefined 时会抛 TypeError
    // 修复后：result.failedTaskIds ?? [] 安全兜底
    expect(() => buildFailureDescription(undefined)).not.toThrow();
    expect(() => buildFailureDescription(null as unknown as number[])).not.toThrow();
  });
});
