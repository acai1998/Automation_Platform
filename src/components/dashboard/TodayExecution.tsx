import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2, HelpCircle, RotateCcw } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { dashboardApi } from "@/lib/api";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CustomTooltip } from "@/components/ui/CustomTooltip";
import type {
  DashboardResponse,
  ChartSegmentData,
  TestStatusFilter
} from "@/types/dashboard";

interface TodayExecutionProps {
  data?: DashboardResponse;
  onRefresh?: () => Promise<void>;
  onFilterChange?: (status: TestStatusFilter) => void;
  selectedFilter?: TestStatusFilter;
}

export function TodayExecution({
  data,
  onRefresh,
  onFilterChange,
  selectedFilter = 'all'
}: TodayExecutionProps) {
  const [loading, setLoading] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

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

  // Force re-animation when data changes
  useEffect(() => {
    setAnimationKey(prev => prev + 1);
  }, [todayData]);

  // 使用 useMemo 缓存计算结果
  const chartData = useMemo(() => {
    const total = Number(todayData?.total) || 0;
    const passed = Number(todayData?.passed) || 0;
    const failed = Number(todayData?.failed) || 0;
    const skipped = Number(todayData?.skipped) || 0;

    if (total === 0) {
      return {
        total: 0,
        segments: [],
        isEmpty: true
      };
    }

    const segments: ChartSegmentData[] = [
      {
        name: '成功',
        value: passed,
        color: '#39E079',
        percentage: Math.round((passed / total) * 100),
        icon: '✓',
        status: 'passed' as TestStatusFilter
      },
      {
        name: '失败',
        value: failed,
        color: '#fa5538',
        percentage: Math.round((failed / total) * 100),
        icon: '✗',
        status: 'failed' as TestStatusFilter
      },
      {
        name: '跳过',
        value: skipped,
        color: '#fbbf24',
        percentage: Math.round((skipped / total) * 100),
        icon: '⊘',
        status: 'skipped' as TestStatusFilter
      }
    ].filter(segment => segment.value > 0);

    return {
      total,
      segments,
      isEmpty: false
    };
  }, [todayData]);

  // 交互处理函数
  const handleSegmentClick = useCallback((data: ChartSegmentData) => {
    if (onFilterChange) {
      const newStatus = selectedFilter === data.status ? 'all' : data.status;
      onFilterChange(newStatus);
    }
  }, [onFilterChange, selectedFilter]);

  const handleCenterClick = useCallback(() => {
    if (onFilterChange) {
      onFilterChange('all');
    }
  }, [onFilterChange]);

  // 自定义 Pie Cell 组件，支持交互
  const renderCustomizedCell = (entry: ChartSegmentData, index: number) => {
    const isSelected = selectedFilter === entry.status;
    const isFiltered = selectedFilter !== 'all';
    const isActive = !isFiltered || isSelected;

    return (
      <Cell
        key={`cell-${index}`}
        fill={entry.color}
        stroke={isSelected ? entry.color : 'transparent'}
        strokeWidth={isSelected ? 3 : 0}
        style={{
          filter: isActive ? 'none' : 'opacity(0.3)',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        className="hover:brightness-110"
      />
    );
  };

  // Empty state component
  const EmptyChart = () => (
    <div className="w-40 h-40 rounded-full border-8 border-slate-200 dark:border-slate-700 flex items-center justify-center">
      <div className="text-center">
        <span className="text-2xl font-bold text-slate-400 dark:text-slate-500">0</span>
        <div className="text-sm text-slate-500 dark:text-gray-400 tracking-normal font-medium text-crisp">
          测试用例
        </div>
      </div>
    </div>
  );

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
            <TooltipContent side="top" sideOffset={12} className="max-w-xs">
              <div className="text-slate-600 dark:text-gray-400 text-sm">
                显示今天内执行用例的实时状态分布（成功/失败/跳过）。点击图表段筛选对应状态的测试，点击中心清除筛选。
              </div>
            </TooltipContent>
          </Tooltip>
          {selectedFilter !== 'all' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCenterClick}
                  className="p-1 rounded text-primary hover:text-primary/80 transition-colors"
                  title="清除筛选"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12}>
                <div className="text-sm">清除筛选</div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-slate-500 dark:text-gray-400 text-sm">实时状态分布</p>
          {selectedFilter !== 'all' && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
              已筛选: {chartData.segments.find(s => s.status === selectedFilter)?.name}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          {/* Interactive Donut Chart */}
          <div className="relative">
            {chartData.isEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width={160} height={160}>
                <PieChart key={animationKey}>
                  <Pie
                    data={chartData.segments as any}
                    cx={80}
                    cy={80}
                    startAngle={-90}
                    endAngle={270}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1000}
                    animationEasing="ease-out"
                    onClick={handleSegmentClick}
                  >
                    {chartData.segments.map((entry, index) =>
                      renderCustomizedCell(entry, index)
                    )}
                  </Pie>
                  <RechartsTooltip
                    content={<CustomTooltip />}
                    wrapperStyle={{ outline: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Interactive Center Content */}
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={handleCenterClick}
              role="button"
              tabIndex={0}
              aria-label={`总计 ${chartData.total} 个测试用例，点击清除筛选`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCenterClick();
                }
              }}
            >
              <div className="text-center pointer-events-none">
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                  {chartData.total}
                </div>
                <div className="text-sm text-slate-600 dark:text-gray-300 tracking-normal font-medium text-crisp">
                  {selectedFilter !== 'all' ? '点击清除' : '测试用例'}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Legend */}
          <div className="flex w-full justify-between gap-2 px-2">
            {chartData.segments.map((segment) => {
              const isSelected = selectedFilter === segment.status;
              const isFiltered = selectedFilter !== 'all';
              const isActive = !isFiltered || isSelected;

              return (
                <button
                  key={segment.status}
                  onClick={() => handleSegmentClick(segment)}
                  className={`flex flex-col items-center gap-1 transition-all duration-200 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    isSelected ? 'bg-slate-100 dark:bg-slate-700 ring-2 ring-primary/20' : ''
                  } ${!isActive ? 'opacity-50' : ''}`}
                  aria-label={`${segment.name}: ${segment.value} 个用例 (${segment.percentage}%)，点击筛选`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full transition-all duration-200"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-sm font-medium text-slate-600 dark:text-gray-300">
                      {segment.name}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {segment.percentage}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
