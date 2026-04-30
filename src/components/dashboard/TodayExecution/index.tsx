import { useEffect, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { buildTodayExecutionChartData, rateLabelMap } from "./chartData";
import { DonutChart } from "./DonutChart";
import { extractHoveredSegment } from "./hover";
import { HoveredSummaryCard } from "./HoveredSummaryCard";
import type { HoveredSegment, TodayExecutionProps } from "./types";

export function TodayExecution({ data }: TodayExecutionProps) {
  const [animationKey, setAnimationKey] = useState(0);
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);

  const todayData = data?.todayExecution;
  const chartData = useMemo(
    () => buildTodayExecutionChartData(todayData),
    [todayData?.total, todayData?.passed, todayData?.failed, todayData?.skipped],
  );

  useEffect(() => {
    setAnimationKey((prev) => prev + 1);
  }, [chartData.total, chartData.stats[0]?.value, chartData.stats[1]?.value, chartData.stats[2]?.value]);

  useEffect(() => {
    if (!hoveredSegment) {
      return;
    }
    const stillExists = chartData.segments.some((segment) => segment.status === hoveredSegment.status);
    if (!stillExists) {
      setHoveredSegment(null);
    }
  }, [chartData.segments, hoveredSegment]);

  const handleSegmentHover = (segment: unknown) => {
    const next = extractHoveredSegment(segment);
    if (next) {
      setHoveredSegment(next);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark p-6 flex flex-col transition-all duration-200 hover:shadow-lg hover:border-primary/10">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-slate-900 dark:text-white text-lg font-bold">今日执行统计</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title="查看说明">
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={12} className="max-w-xs">
              <div className="text-slate-600 dark:text-gray-400 text-sm">
                显示今天内执行用例的实时状态分布（成功/失败/跳过/运行中）。
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
          今日共执行<span className="font-semibold text-slate-700 dark:text-gray-200">{chartData.total}</span> 个用例
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between gap-4">
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="relative flex items-center justify-center">
            <DonutChart
              animationKey={animationKey}
              chartData={chartData}
              hoveredSegment={hoveredSegment}
              onSegmentHover={handleSegmentHover}
              onSegmentLeave={() => setHoveredSegment(null)}
            />

            {hoveredSegment && <HoveredSummaryCard hoveredSegment={hoveredSegment} />}
          </div>
        </div>

        <div className="w-full grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-700/50">
          {chartData.stats.map((stat) => (
            <div
              key={stat.status}
              className="flex flex-col items-center gap-1 py-3 px-2"
            >
              <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
                {rateLabelMap[stat.status]}
              </span>
              <span
                className="text-xl font-bold"
                style={{ color: stat.value > 0 ? stat.color : "#94a3b8" }}
              >
                {stat.percentage.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
