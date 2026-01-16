import { useEffect, useState, useMemo } from "react";
import { Loader2, HelpCircle } from "lucide-react";
import { dashboardApi } from "@/lib/api";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { DashboardResponse } from "@/types/dashboard";

interface TodayExecutionData {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface TodayExecutionProps {
  data?: DashboardResponse;
  onRefresh?: () => Promise<void>;
}

export function TodayExecution({ data, onRefresh }: TodayExecutionProps) {
  const [loading, setLoading] = useState(false);

  // 使用批量数据或回退到单独获取
  const todayData = data?.todayExecution;

  // 数据获取函数（仅在批量数据不可用时使用）
  const fetchData = async () => {
    if (data?.todayExecution) return; // 如果已有批量数据，不重复获取

    try {
      setLoading(true);
      const response = await dashboardApi.getTodayExecution();
      if (response.success && response.data) {
        // 这里可以设置本地状态，但由于我们使用批量数据，这个路径很少执行
      }
    } catch (err) {
      console.error('Failed to fetch today execution:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data?.todayExecution) {
      fetchData();
    }
  }, [data?.todayExecution]);

  // 使用 useMemo 缓存计算结果
  const chartData = useMemo(() => {
    const total = Number(todayData?.total) || 0;
    const passed = Number(todayData?.passed) || 0;
    const failed = Number(todayData?.failed) || 0;
    const skipped = Number(todayData?.skipped) || 0;

    const passedPercent = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failedPercent = total > 0 ? Math.round((failed / total) * 100) : 0;
    const skippedPercent = total > 0 ? Math.round((skipped / total) * 100) : 0;

    // Create conic gradient for donut chart
    const gradient = total > 0
      ? `conic-gradient(
          #39E079 0% ${passedPercent}%,
          #fa5538 ${passedPercent}% ${passedPercent + failedPercent}%,
          #fbbf24 ${passedPercent + failedPercent}% 100%
        )`
      : '#e5e7eb';

    return {
      total,
      passedPercent,
      failedPercent,
      skippedPercent,
      gradient
    };
  }, [todayData]);

  return (
    <div className="xl:col-span-1 rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark p-6 flex flex-col transition-all duration-200 hover:shadow-lg hover:border-primary/10">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-slate-900 dark:text-white text-lg font-bold">今日执行统计</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title="查看说明">
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="text-slate-600 dark:text-gray-400 text-sm">显示今天内执行用例的实时状态分布（成功/失败/跳过），用于快速了解当前执行情况。</div>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-slate-500 dark:text-gray-400 text-sm">实时状态分布</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          {/* Donut Chart */}
          <div
            className="donut-chart shadow-xl shadow-black/10 dark:shadow-black/20"
            style={{ background: chartData.gradient }}
          >
            <div className="donut-hole">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{chartData.total}</span>
              <span className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                测试用例
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex w-full justify-between gap-2 px-2">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-success"></span>
                <span className="text-sm font-medium text-slate-600 dark:text-gray-300">成功</span>
              </div>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{chartData.passedPercent}%</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-danger"></span>
                <span className="text-sm font-medium text-slate-600 dark:text-gray-300">失败</span>
              </div>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{chartData.failedPercent}%</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-warning"></span>
                <span className="text-sm font-medium text-slate-600 dark:text-gray-300">跳过</span>
              </div>
              <span className="text-lg font-bold text-slate-900 dark:text-white">{chartData.skippedPercent}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
