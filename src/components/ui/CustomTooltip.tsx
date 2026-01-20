import { ChartSegmentData } from '@/types/dashboard';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartSegmentData;
  }>;
  label?: string;
}

export function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-lg shadow-lg p-3 max-w-xs">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: data.color }}
        >
          {data.icon}
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">
          {data.name}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-gray-400">数量:</span>
          <span className="font-medium text-slate-900 dark:text-white">{data.value}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600 dark:text-gray-400">占比:</span>
          <span className="font-medium text-slate-900 dark:text-white">{data.percentage}%</span>
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="mt-3">
        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: `${data.percentage}%`,
              backgroundColor: data.color
            }}
          />
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500 dark:text-gray-400">
        点击筛选 {data.name} 状态的测试
      </div>
    </div>
  );
}