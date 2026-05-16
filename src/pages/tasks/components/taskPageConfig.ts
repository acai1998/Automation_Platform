import type { CheckedState } from '@radix-ui/react-checkbox';
import type { Task } from '@/hooks/useTasks';
import type { CaseType } from '@/hooks/useCases';
import { TASK_MESSAGES } from '@/constants/messages';

export type TaskTriggerType = 'manual' | 'scheduled' | 'ci_triggered';
export type TaskStatusFilter = '' | 'active' | 'paused' | 'archived';
export type TaskTriggerFilter = '' | TaskTriggerType;

export const TASK_STATUS_FILTER_OPTIONS: readonly TaskStatusFilter[] = [
  '',
  'active',
  'paused',
  'archived',
];

export const TASK_TRIGGER_FILTER_OPTIONS: readonly TaskTriggerFilter[] = [
  '',
  'manual',
  'scheduled',
  'ci_triggered',
];

export const TASK_TRIGGER_TYPE_OPTIONS: ReadonlyArray<{ value: TaskTriggerType; label: string }> = [
  { value: 'manual', label: '手动触发' },
  { value: 'scheduled', label: '定时触发' },
  { value: 'ci_triggered', label: 'CI 触发' },
];

export const CASE_TYPE_FILTER_OPTIONS: ReadonlyArray<{ value: CaseType | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'api', label: 'API' },
  { value: 'ui', label: 'UI' },
  { value: 'performance', label: '性能' },
];

export const AUDIT_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: '创建任务', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  updated: { label: '更新任务', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  deleted: { label: '删除任务', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  status_changed: { label: '状态变更', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  manually_triggered: { label: '手动触发', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  execution_cancelled: { label: '取消执行', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  compensated: { label: '漏触补偿', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  triggered: { label: '调度触发', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  retry_scheduled: { label: '重试排队', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  permanently_failed: { label: '彻底失败', color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
};

export type TaskViewMode = 'cards' | 'table';
export type TaskTagFilter = '' | 'has_cases' | 'scheduled' | 'failed' | 'healthy';
export type TaskSortKey = 'name' | 'status' | 'trigger' | 'owner' | 'latestRun' | 'successRate';
export type SortDirection = 'asc' | 'desc';

export const TASK_FILTER_PRESET_KEY = 'task-management.common-filters';

export const TASK_TAG_FILTER_OPTIONS: ReadonlyArray<{ value: TaskTagFilter; label: string }> = [
  { value: '', label: '全部标签' },
  { value: 'has_cases', label: '已关联用例' },
  { value: 'scheduled', label: '定时任务' },
  { value: 'failed', label: '失败预警' },
  { value: 'healthy', label: '稳定任务' },
];

export const TABLE_COLUMN_OPTIONS: ReadonlyArray<{ key: TaskSortKey; label: string }> = [
  { key: 'name', label: '任务名' },
  { key: 'status', label: '状态' },
  { key: 'trigger', label: '触发方式' },
  { key: 'owner', label: '负责人' },
  { key: 'latestRun', label: '最近运行' },
  { key: 'successRate', label: '成功率' },
];

export const TASK_STATUS_SEMANTIC = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
} as const;

export type TaskSemanticStatus = keyof typeof TASK_STATUS_SEMANTIC;

export const isCheckedState = (checked: CheckedState): boolean => checked === true;

export const getErrorMessage = (error: unknown, fallback: string = TASK_MESSAGES.GENERIC_ERROR): string =>
  error instanceof Error ? error.message : fallback;

export const parseCaseCount = (task: Task): number => {
  if (!task.case_ids) return 0;
  try {
    const ids = JSON.parse(task.case_ids);
    return Array.isArray(ids) ? ids.length : 0;
  } catch {
    return 0;
  }
};

export const getTaskSuccessRate = (task: Task): number | null => {
  const latest = task.recentExecutions?.[0];
  if (!latest?.total_cases) return null;
  return Math.round((latest.passed_cases / latest.total_cases) * 100);
};

export const getTaskSemanticStatus = (task: Task): { key: TaskSemanticStatus; label: string } => {
  if (task.status === 'archived') return { key: 'draft', label: '草稿' };

  const latest = task.recentExecutions?.[0];
  if (latest?.status === 'running' || latest?.status === 'pending') {
    return { key: 'running', label: '运行中' };
  }
  if (task.status === 'paused') return { key: 'paused', label: '暂停' };
  if (latest?.status === 'failed') return { key: 'failed', label: '失败' };
  // 从未执行过时（latest 为空），显示"空闲"而非"成功"，避免语义误导
  if (!latest) return { key: 'draft', label: '空闲' };
  return { key: 'success', label: '成功' };
};

export const formatTime = (value?: string): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};
