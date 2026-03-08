import { useEffect, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { DashboardResponse, TestStatusFilter } from "@/types/dashboard";

interface TodayExecutionProps {
  data?: DashboardResponse;
}

type SegmentStatus = Exclude<TestStatusFilter, "all">;

interface ChartSegment {
  [key: string]: string | number;
  name: string;
  value: number;
  color: string;
  percentage: number;
  icon: string;
  status: SegmentStatus;
}

type HoveredSegment = Pick<ChartSegment, "name" | "value" | "color" | "percentage" | "status">;

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function TodayExecution({ data }: TodayExecutionProps) {
  const [animationKey, setAnimationKey] = useState(0);
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);

  const todayData = data?.todayExecution;

  const chartData = useMemo(() => {
    const total = toSafeNumber(todayData?.total);
    const passed = toSafeNumber(todayData?.passed);
    const failed = toSafeNumber(todayData?.failed);
    const skipped = toSafeNumber(todayData?.skipped);

    const calcPercentage = (value: number): number => {
      if (total <= 0) {
        return 0;
      }
      return Math.round((value / total) * 10000) / 100;
    };

    const stats: ChartSegment[] = [
      {
        name: "成功",
        value: passed,
        color: "#39E079",
        percentage: calcPercentage(passed),
        icon: "✓",
        status: "passed",
      },
      {
        name: "失败",
        value: failed,
        color: "#fa5538",
        percentage: calcPercentage(failed),
        icon: "✗",
        status: "failed",
      },
      {
        name: "跳过",
        value: skipped,
        color: "#fbbf24",
        percentage: calcPercentage(skipped),
        icon: "⊘",
        status: "skipped",
      },
    ];

    const segments = stats.filter((segment) => segment.value > 0);

    return {
      total,
      stats,
      segments,
      isEmpty: total === 0,
    };
  }, [todayData?.total, todayData?.passed, todayData?.failed, todayData?.skipped]);

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
    if (!segment || typeof segment !== "object") {
      return;
    }

    const candidate = segment as Partial<ChartSegment>;
    if (
      typeof candidate.name === "string" &&
      typeof candidate.value === "number" &&
      typeof candidate.color === "string" &&
      typeof candidate.percentage === "number" &&
      typeof candidate.status === "string"
    ) {
      setHoveredSegment({
        name: candidate.name,
        value: candidate.value,
        color: candidate.color,
        percentage: candidate.percentage,
        status: candidate.status as SegmentStatus,
      });
    }
  };

  return (
    <div className="xl:col-span-1 rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark p-6 flex flex-col transition-all duration-200 hover:shadow-lg hover:border-primary/10">
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
显示今天内执行用例的实时状态分布（成功/失败/跳过）。
</div>
            </TooltipContent>
          </Tooltip>
        </div>
<p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
今日共执行 <span className="font-semibold text-slate-700 dark:text-gray-200">{chartData.total}</span> 个用例
</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between gap-4">
        {/* 中间图表区：圆图绝对居中，hover 卡片用 absolute 定位到右侧不影响圆图位置 */}
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="relative flex items-center justify-center">
            {/* 圆形甜甜圈图，使用固定尺寸避免裁切 */}
            <div className="relative flex-shrink-0" style={{ width: 172, height: 172 }}>
              {chartData.isEmpty ? (
                <>
                  <PieChart width={172} height={172}>
                    <Pie
                      data={[{ name: "empty", value: 1 }]}
                      cx={86}
                      cy={86}
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      <Cell fill="#e2e8f0" stroke="transparent" />
                    </Pie>
                  </PieChart>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-slate-300 dark:text-slate-600">0</div>
                      <div className="text-sm text-slate-400 dark:text-slate-500 font-medium">总用例</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <PieChart
                    key={animationKey}
                    width={172}
                    height={172}
                  >
                    <Pie
                      data={chartData.segments}
                      cx={86}
                      cy={86}
                      startAngle={-90}
                      endAngle={270}
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      animationBegin={200}
                      animationDuration={1000}
                      animationEasing="ease-out"
                      onMouseEnter={handleSegmentHover}
                      onMouseLeave={() => setHoveredSegment(null)}
                    >
                      {chartData.segments.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke={hoveredSegment?.name === entry.name ? entry.color : "transparent"}
                          strokeWidth={hoveredSegment?.name === entry.name ? 3 : 0}
                          opacity={hoveredSegment && hoveredSegment.name !== entry.name ? 0.45 : 1}
                          style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                        />
                      ))}
                    </Pie>
                  </PieChart>

                  {/* 圆心文字 */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center transition-all duration-200">
                      {hoveredSegment ? (
                        <>
                          <div
                            className="text-2xl font-bold transition-colors duration-200"
                            style={{ color: hoveredSegment.color }}
                          >
                            {hoveredSegment.value}
                          </div>
                          <div className="text-xs font-medium text-slate-500 dark:text-gray-400">
                            {hoveredSegment.name}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-3xl font-bold text-slate-900 dark:text-white">
                            {chartData.total}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-gray-300 font-medium">
                            总用例
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 右侧信息卡片：absolute 定位在圆图右侧，不影响圆图居中 */}
            {hoveredSegment && (
              <div
                className="absolute top-1/2 -translate-y-1/2 transition-all duration-200"
                style={{ left: "calc(50% + 94px)", width: 108 }}
              >
                <div
                  className="rounded-xl border p-3 shadow-md bg-white dark:bg-surface-dark"
                  style={{ borderColor: `${hoveredSegment.color}40` }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: hoveredSegment.color }}
                    />
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
                      <span
                        className="text-xs font-bold"
                        style={{ color: hoveredSegment.color }}
                      >
                        {hoveredSegment.percentage.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
                    <div
                      className="h-1 rounded-full transition-all duration-300"
                      style={{
                        width: `${hoveredSegment.percentage}%`,
                        backgroundColor: hoveredSegment.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-700/50">
          {chartData.stats.map((stat) => (
            <div
              key={stat.status}
              className="flex flex-col items-center gap-1 py-3 px-2"
            >
              <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
                {stat.name}
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
