import "./HoveredSummaryCard.css";
import type { HoveredSegment } from "./types";

interface HoveredSummaryCardProps {
  hoveredSegment: HoveredSegment;
}

const toneClassMap = {
  passed: {
    border: "border-[#39E079]/25",
    dot: "bg-[#39E079]",
    percentage: "text-[#39E079]",
    progress: "today-execution-progress today-execution-progress--passed",
  },
  failed: {
    border: "border-[#fa5538]/25",
    dot: "bg-[#fa5538]",
    percentage: "text-[#fa5538]",
    progress: "today-execution-progress today-execution-progress--failed",
  },
  skipped: {
    border: "border-[#fbbf24]/25",
    dot: "bg-[#fbbf24]",
    percentage: "text-[#fbbf24]",
    progress: "today-execution-progress today-execution-progress--skipped",
  },
  running: {
    border: "border-[#60a5fa]/25",
    dot: "bg-[#60a5fa]",
    percentage: "text-[#60a5fa]",
    progress: "today-execution-progress today-execution-progress--running",
  },
} as const;

export function HoveredSummaryCard({ hoveredSegment }: HoveredSummaryCardProps) {
  const toneClasses = toneClassMap[hoveredSegment.status];

  return (
    <div className="absolute left-[calc(50%+94px)] top-1/2 w-[108px] -translate-y-1/2 transition-all duration-200">
      <div
        className={`rounded-xl border bg-white p-3 shadow-md dark:bg-surface-dark ${toneClasses.border}`}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${toneClasses.dot}`} />
          <span className="text-xs font-semibold text-slate-800 dark:text-white">
            {hoveredSegment.name}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-gray-500">数量</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">
              {hoveredSegment.value}个
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-gray-500">占比</span>
            <span className={`text-xs font-bold ${toneClasses.percentage}`}>
              {hoveredSegment.percentage.toFixed(2)}%
            </span>
          </div>
        </div>
        <progress
          className={`mt-2 h-1 w-full overflow-hidden rounded-full ${toneClasses.progress}`}
          max={100}
          value={hoveredSegment.percentage}
        />
      </div>
    </div>
  );
}
