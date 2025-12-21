import { Layout } from "@/components/Layout";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { TodayExecution } from "@/components/dashboard/TodayExecution";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { RecentTests } from "@/components/dashboard/RecentTests";
import { Button } from "@/components/ui/button";
import { Play, Calendar, ChevronDown } from "lucide-react";
import { useState } from "react";

type TimeRange = '7d' | '30d' | '90d';

export default function Home() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  return (
    <Layout>
      <div className="p-6 md:p-8 lg:p-12">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          {/* Page Heading */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-slate-900 dark:text-white text-3xl md:text-4xl font-black tracking-tight">
                仪表盘
              </h2>
              <p className="text-slate-500 dark:text-[#92c9a9] text-base font-normal">
                自动化测试套件性能概览
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Time Range Selector */}
              <div className="relative">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                  title="选择时间范围"
                  aria-label="选择时间范围"
                  className="appearance-none flex items-center bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#234833] rounded-lg px-4 py-2.5 pr-10 text-sm text-slate-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="7d">近 7 天</option>
                  <option value="30d">近 30 天</option>
                  <option value="90d">近 90 天</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Run Test Button */}
              <Button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                <Play className="h-4 w-4" />
                <span>执行测试</span>
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <StatsCards />

          {/* Charts Section */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Today's Execution Donut Chart */}
            <TodayExecution />

            {/* Trend Line Chart */}
            <TrendChart timeRange={timeRange} />
          </div>

          {/* Recent Test Runs */}
          <RecentTests />
        </div>
      </div>
    </Layout>
  );
}
