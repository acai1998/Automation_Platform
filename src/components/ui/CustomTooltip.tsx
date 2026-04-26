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
    <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-lg shadow-lg p-3 min-w-[160px]">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: data.color }}
        />
        <span className="font-semibold text-slate-900 dark:text-white text-sm">
          {data.name}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-gray-400">数量</span>
          <span className="font-semibold text-slate-900 dark:text-white">{data.value} 次</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-gray-400">占比</span>
          <span className="font-bold" style={{ color: data.color }}>{data.percentage}%</span>
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="mt-2.5">
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
    </div>
  );
}