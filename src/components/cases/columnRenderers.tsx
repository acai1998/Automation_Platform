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
