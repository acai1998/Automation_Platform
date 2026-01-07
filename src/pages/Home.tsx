import { StatsCards } from "@/components/dashboard/StatsCards";
import { TodayExecution } from "@/components/dashboard/TodayExecution";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { RecentTests } from "@/components/dashboard/RecentTests";
import { Button } from "@/components/ui/button";
import { Play, ChevronDown, LayoutDashboard } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";

type TimeRange = '7d' | '30d' | '90d';

export default function Home() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 顶部标题区 - 带渐变背景 */}
      <div className="relative px-4 sm:px-6 py-6 bg-gradient-to-r from-teal-500/20 via-teal-500/5 to-transparent dark:from-slate-800/50 dark:via-transparent rounded-t-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shadow-sm">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                仪表盘
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                自动化测试数据概览
              </p>
            </div>
          </div>

          {/* 操作按钮组 */}
          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <div className="relative">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                title="选择时间范围"
                aria-label="选择时间范围"
                className="appearance-none h-9 px-4 pr-10 text-sm bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 hover:shadow-md"
              >
                <option value="7d">近 7 天</option>
                <option value="30d">近 30 天</option>
                <option value="90d">近 90 天</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Run Test Button */}
            <Button className="h-9 px-4 gap-2 bg-teal-500 hover:bg-teal-600 text-white shadow-lg shadow-teal-500/20 transition-all duration-200 hover:shadow-teal-500/30">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">执行测试</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          {/* Stats Cards */}
          <TooltipProvider>
            <StatsCards />

            {/* Charts Section */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Today's Execution Donut Chart */}
              <TodayExecution />

              {/* Trend Line Chart */}
              <TrendChart timeRange={timeRange} />
            </div>
          </TooltipProvider>

          {/* Recent Test Runs */}
          <RecentTests />
        </div>
      </div>
    </div>
  );
}