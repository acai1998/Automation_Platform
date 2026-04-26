/**
 * 任务管理相关常量配置
 */

// 分页配置
export const TASKS_CONFIG = {
  PAGE_SIZE: 12,
  SEARCH_DEBOUNCE_MS: 300,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 1000,
  RECENT_EXECUTIONS_DISPLAY: 10,
  CRON_SEGMENTS: 5,
} as const;

// 触发类型标签映射
export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  manual: '手动',
  scheduled: '定时',
  ci_triggered: 'CI',
} as const;

// 状态标签映射
export const STATUS_LABELS: Record<string, string> = {
  active: '活跃',
  paused: '暂停',
  archived: '已归档',
} as const;

// 状态颜色映射（Tailwind CSS 类）
export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
} as const;

// 执行状态配置
export const EXECUTION_STATUS_CONFIG: Record<
  string,
  { color: string; label: string }
> = {
  success: { color: 'bg-green-500', label: '成功' },
  failed: { color: 'bg-red-500', label: '失败' },
  running: { color: 'bg-blue-500 animate-pulse', label: '运行中' },
  pending: { color: 'bg-slate-300', label: '等待中' },
  cancelled: { color: 'bg-slate-400', label: '已取消' },
} as const;

// 成功率颜色阈值
export const SUCCESS_RATE_THRESHOLDS = {
  HIGH: 90,
  MEDIUM: 70,
} as const;
