import { StatsCards } from "@/components/dashboard/StatsCards";
import { TodayExecution } from "@/components/dashboard/TodayExecution";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { RecentTests } from "@/components/dashboard/RecentTests";
import { Button } from "@/components/ui/button";
import { Play, ChevronDown } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { dashboardApi } from "@/lib/api";
import { useDashboardFilter } from "@/hooks/useDashboardFilter";
import type { DashboardResponse, RecentRun } from "@/types/dashboard";

type TimeRange = '7d' | '30d' | '90d';

// 扩展 DashboardResponse 以包含 recentRuns（用于内部状态管理）
interface DashboardDataWithRuns extends DashboardResponse {
  recentRuns?: RecentRun[];
}

export default function Home() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dashboardData, setDashboardData] = useState<DashboardDataWithRuns | null>(null);
  const [, setLoading] = useState(true);

  // Filter state management for chart interactions
  const { filterState, setFilter } = useDashboardFilter();

  const fetchAllData = async () => {
    try {
      setLoading(true);
      // 并行获取仪表盘数据和最近运行记录（仅首次加载）
      const shouldFetchRecentRuns = !dashboardData?.recentRuns;
      
      const [dashboardResponse, recentRunsResponse] = await Promise.all([
        dashboardApi.getAll(timeRange),
        shouldFetchRecentRuns ? dashboardApi.getRecentRuns(10) : Promise.resolve({ success: true, data: dashboardData?.recentRuns || [] })
      ]);

      if (dashboardResponse.success && dashboardResponse.data) {
        setDashboardData({
          ...dashboardResponse.data,
          recentRuns: recentRunsResponse.success ? recentRunsResponse.data : dashboardData?.recentRuns || []
        });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // 如果获取所有数据失败，至少获取最近运行的记录
      try {
        const recentRunsResponse = await dashboardApi.getRecentRuns(10);
        if (recentRunsResponse.success && recentRunsResponse.data) {
          setDashboardData(prev => ({
            stats: prev?.stats || {
              totalCases: 0,
              todayRuns: 0,
              todaySuccessRate: null,
              runningTasks: 0
            },
            todayExecution: prev?.todayExecution || {
              total: 0,
              passed: 0,
              failed: 0,
              skipped: 0
            },
            trendData: prev?.trendData || [],
            recentRuns: recentRunsResponse.data || []
          }));
        }
      } catch (recentError) {
        console.error('Failed to fetch recent runs:', recentError);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [timeRange]);

  return (
    <div className="p-6 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
          {/* Page Heading */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-up">
            <div className="flex flex-col gap-1">
              <h2 className="text-slate-900 dark:text-white text-3xl md:text-4xl font-black tracking-tight">
                仪表盘
              </h2>
              <p className="text-slate-500 dark:text-[#92c9a9] text-base font-normal">
                自动化测试数据概览
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
                  className="appearance-none flex items-center bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-lg px-4 py-2.5 pr-10 text-sm text-slate-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
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
          <div className="animate-fade-in-up animate-delay-200">
            <TooltipProvider>
              <StatsCards
                data={dashboardData || undefined}
                onRefresh={fetchAllData}
              />
            </TooltipProvider>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in-up animate-delay-300">
            {/* Today's Execution Donut Chart */}
            <TodayExecution
              data={dashboardData || undefined}
              onRefresh={fetchAllData}
              onFilterChange={setFilter}
              selectedFilter={filterState.selectedStatus}
            />

            {/* Trend Line Chart */}
            <TrendChart
              timeRange={timeRange}
              data={dashboardData || undefined}
              onRefresh={fetchAllData}
            />
          </div>

          {/* Recent Test Runs */}
          <div className="animate-fade-in-up animate-delay-400">
            <RecentTests
              data={dashboardData || undefined}
              onRefresh={fetchAllData}
              statusFilter={filterState.selectedStatus}
            />
          </div>
        </div>
      </div>
    );
}