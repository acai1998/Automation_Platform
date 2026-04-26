import type { DashboardResponse } from "@/types/dashboard";
import type { ChartSegment, RateStatus } from "./types";

export function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export const rateLabelMap: Record<RateStatus, string> = {
  passed: "成功率",
  failed: "失败率",
  skipped: "跳过率",
};

export function buildTodayExecutionChartData(todayData: DashboardResponse["todayExecution"] | undefined) {
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

  const stats: Array<ChartSegment & { status: RateStatus }> = [
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
      icon: "✕",
      status: "failed",
    },
    {
      name: "跳过",
      value: skipped,
      color: "#fbbf24",
      percentage: calcPercentage(skipped),
      icon: "○",
      status: "skipped",
    },
  ];

  const finishedCases = passed + failed + skipped;
  const running = Math.max(total - finishedCases, 0);

  const segments = [
    ...stats,
    {
      name: "运行中",
      value: running,
      color: "#60a5fa",
      percentage: calcPercentage(running),
      icon: "●",
      status: "running" as const,
    },
  ].filter((segment) => segment.value > 0);

  return {
    total,
    stats,
    segments,
    isEmpty: total === 0,
  };
}
