import { useEffect, useState, useMemo } from "react";
import { Loader2, HelpCircle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { dashboardApi } from "@/api";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { CustomTooltip } from "@/components/ui/CustomTooltip";
import type {
  DashboardResponse,
} from "@/types/dashboard";

interface TodayExecutionProps {
  data?: DashboardResponse;
  onRefresh?: () => Promise<void>;
}

export function TodayExecution({
  data,
}: TodayExecutionProps) {
  const [loading, setLoading] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

  // 使用批量数据或回退到单独获取
  const todayData = data?.todayExecution;

  // 数据获取函数（仅在批量数据不可用时使用）
  const fetchData = async () => {
    if (data?.todayExecution) return;

    try {
      setLoading(true);
      await dashboardApi.getTodayExecution();
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

    // 始终定义三个指标（成功、失败、跳过）
    const stats = [
      {
        name: '成功',
        value: passed,
        color: '#39E079',
        percentage: total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00',
        icon: '✓',
        status: 'passed'
      },
      {
        name: '失败',
        value: failed,
        color: '#fa5538',
        percentage: total > 0 ? ((failed / total) * 100).toFixed(2) : '0.00',
        icon: '✗',
        status: 'failed'
      },
      {
        name: '跳过',
        value: skipped,
        color: '#fbbf24',
        percentage: total > 0 ? ((skipped / total) * 100).toFixed(2) : '0.00',
        icon: '⊘',
        status: 'skipped'
      }
    ];

    if (total === 0) {
      // 空状态：饼图展示三色等分占位
      const emptySegments = [
        { name: '成功', value: 1, color: '#e2e8f0' },
        { name: '失败', value: 1, color: '#e2e8f0' },
        { name: '跳过', value: 1, color: '#e2e8f0' },
      ];
      return {
        total: 0,
        stats,
        segments: emptySegments,
        isEmpty: true
      };
    }

    // 有数据时：只将值>0的部分绘制到饼图中
    const segments = stats
      .filter(s => s.value > 0)
      .map(s => ({ name: s.name, value: s.value, color: s.color }));

    return {
      total,
      stats,
      segments,
      isEmpty: false
    };
  }, [todayData]);

  // Empty state component
  const EmptyChart = () => (
    <ResponsiveContainer width={160} height={160}>
      <PieChart>
        <Pie
          data={[{ name: 'empty', value: 1 }]}
          cx={80}
          cy={80}
          innerRadius={55}
          outerRadius={80}
          dataKey="value"
          isAnimationActive={false}
        >
          <Cell fill="#e2e8f0" stroke="transparent" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
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
                显示今天内执行用例的实时状态分布（成功/失败/跳过）。
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
          今日共运行 <span className="font-semibold text-slate-700 dark:text-gray-200">{chartData.total}</span> 次
        </p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          {/* Donut Chart */}
          <div className="relative">
            {chartData.isEmpty ? (
              <>
                <EmptyChart />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-300 dark:text-slate-600">0</div>
                    <div className="text-sm text-slate-400 dark:text-slate-500 font-medium">暂无数据</div>
                  </div>
                </div>
              </>
            ) : (
              <>
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
                    >
                      {chartData.segments.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="transparent"
                          strokeWidth={0}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={<CustomTooltip />}
                      wrapperStyle={{ outline: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Content */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">
                      {chartData.total}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-gray-300 font-medium">
                      测试用例
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Stats Legend — 始终展示三项 */}
          <div className="w-full flex flex-col gap-2 px-1">
            {chartData.stats.map((stat) => (
              <div
                key={stat.status}
                className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stat.color }}
                  />
                  <span className="text-sm font-medium text-slate-600 dark:text-gray-300">
                    {stat.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-800 dark:text-white">
                    {stat.value} 次
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">=</span>
                  <span
                    className="font-bold min-w-[60px] text-right"
                    style={{ color: stat.value > 0 ? stat.color : undefined }}
                  >
                    {stat.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
