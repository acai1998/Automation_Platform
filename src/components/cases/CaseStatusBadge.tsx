import { cn } from '@/lib/utils';
import type { RunningStatus } from '@/hooks/useCases';

interface CaseStatusBadgeProps {
  status: RunningStatus;
  className?: string;
}

/**
 * 用例运行状态标签
 */
export function CaseStatusBadge({ status, className }: CaseStatusBadgeProps) {
  const isRunning = status === 'running';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        isRunning
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
        className
      )}
    >
      {isRunning && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>
      )}
      {isRunning ? '运行中' : '空闲'}
    </span>
  );
}
