import type { ReactNode } from 'react';

/**
 * 通用列渲染器样式常量
 */
const CELL_STYLES = {
  /** 次要文本样式 */
  secondary: 'text-gray-600 dark:text-gray-400',
  /** 代码/脚本路径样式 */
  mono: 'text-gray-600 dark:text-gray-400 font-mono text-xs',
  /** 描述文本样式（支持换行截断） */
  description: 'text-gray-600 dark:text-gray-400 line-clamp-2 max-w-md',
} as const;

/**
 * 优先级颜色配置
 */
const PRIORITY_STYLES: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  P1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  P2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  P3: 'bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-400',
};

/**
 * 渲染脚本路径
 * 显示等宽字体的脚本路径，无值时显示 '-'
 */
export function renderScriptPath(value: unknown): ReactNode {
  return (
    <span className={CELL_STYLES.mono}>
      {typeof value === 'string' && value ? value : '-'}
    </span>
  );
}

/**
 * 渲染描述文本
 * 支持最多2行截断，无值时显示 '-'
 */
export function renderDescription(value: unknown): ReactNode {
  return (
    <span className={CELL_STYLES.description}>
      {typeof value === 'string' && value ? value : '-'}
    </span>
  );
}

/**
 * 渲染优先级标签
 * P0: 红色, P1: 橙色, P2: 蓝色, P3: 灰色
 */
export function renderPriority(value: unknown): ReactNode {
  const priority = typeof value === 'string' ? value : 'P1';
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.P1;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {priority}
    </span>
  );
}

/**
 * 渲染负责人
 * 无值时显示 '-'
 */
export function renderOwner(value: unknown): ReactNode {
  return (
    <span className={CELL_STYLES.secondary}>
      {typeof value === 'string' && value ? value : '-'}
    </span>
  );
}
