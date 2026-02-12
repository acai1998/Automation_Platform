import { useEffect, useState, useMemo } from "react";
import { CheckCircle, Terminal, AlertCircle, Timer, TrendingUp, TrendingDown, Loader2, HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { dashboardApi } from "@/api";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { StatCardSkeleton } from "@/components/ui/StatCardSkeleton";
import type { DashboardResponse } from "@/types/dashboard";

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  onClick?: () => void;
  loading?: boolean;
  /** 可选：悬浮提示说明 */
  description?: string;
}

function StatCard({ icon, iconBg, iconColor, label, value, trend, onClick, loading, description }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-4 rounded-xl p-6 border border-slate-200 dark:border-border-dark bg-gradient-to-br from-white to-slate-50/50 dark:from-surface-dark dark:to-surface-dark/80 shadow-sm transition-all duration-200 overflow-visible hover:shadow-lg hover:scale-[1.02] ${onClick ? 'cursor-pointer hover:border-primary/20 hover:from-primary/5 hover:to-primary/10' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className={`p-3 ${iconBg} rounded-xl shadow-sm ${iconColor} transition-transform duration-200 hover:scale-110`}>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  aria-label={`${label} 说明`
                  }
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12} className="max-w-xs">
                <div className="text-slate-600 dark:text-gray-400 text-sm">
                  {description}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-slate-500 dark:text-gray-400 text-sm font-medium">{label}</p>
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="text-slate-400 text-sm">加载中...</span>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-slate-900 dark:text-white text-3xl font-bold tracking-tight leading-none">{value}</p>
            {trend && (
              <div className="flex items-center gap-1">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
                    trend.isPositive
                      ? "text-success bg-success/10"
                      : "text-danger bg-danger/10"
                  }`}
                >
                  {trend.isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trend.value}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatsCardsProps {
  data?: DashboardResponse;
  onRefresh?: () => Promise<void>;
}

export function StatsCards({ data }: StatsCardsProps) {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);

  // 使用批量数据或回退到单独获取
  const stats = data?.stats;

  // 数据获取函数（仅在批量数据不可用时使用）
  const fetchStats = async () => {
    if (data?.stats) return; // 如果已有批量数据，不重复获取

    try {
      setLoading(true);
      setError(null);
      const response = await dashboardApi.getStats();
      if (response.success && response.data) {
        // 这里可以设置本地状态，但由于我们使用批量数据，这个路径很少执行
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data?.stats) {
      fetchStats();
    }
  }, [data?.stats]);

  // 使用 useMemo 缓存卡片配置，避免每次渲染都重新创建
  const cardsConfig = useMemo(() => [
    {
      icon: <Terminal className="h-5 w-5" />,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      label: "自动化用例总数",
      value: typeof stats?.totalCases === 'number' ? stats.totalCases.toLocaleString() : '-',
      onClick: () => setLocation('/cases'),
      description: "统计项目中已创建的自动化用例总数，包含所有状态的用例。",
    },
    {
      icon: <CheckCircle className="h-5 w-5" />,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      label: "今日执行总次数",
      value: typeof stats?.todayRuns === 'number' ? stats.todayRuns.toString() : '-',
      description: "显示今天内完成的所有测试执行次数，包括成功和失败的执行。用于评估团队的测试执行频率和工作量。",
    },
    {
      icon: <AlertCircle className="h-5 w-5" />,
      iconBg: stats && stats.todaySuccessRate !== null && stats.todaySuccessRate < 80 ? "bg-danger/10" : "bg-success/10",
      iconColor: stats && stats.todaySuccessRate !== null && stats.todaySuccessRate < 80 ? "text-danger" : "text-success",
      label: "今日成功率%",
      value: stats && stats.todaySuccessRate !== null ? `${stats.todaySuccessRate}%` : 'N/A',
      description: "基于今日完成的测试执行计算的成功率，低于 80% 会显示为警示颜色。",
    },
    {
      icon: <Timer className="h-5 w-5" />,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      label: "当前运行中任务",
      value: typeof stats?.runningTasks === 'number' ? stats.runningTasks.toString() : '-',
      onClick: () => setLocation('/tasks'),
      description: "当前正在执行或调度中的任务数量，用于监控并发执行情况和资源占用。",
    },
  ], [stats, setLocation]);

  // Show skeleton when no data is available
  if (!data || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-fade-in-up" style={{ animationDelay: `${index * 100}ms` }}>
            <StatCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-visible">
        {cardsConfig.map((config, index) => (
          <div key={index} className="animate-fade-in-up overflow-visible" style={{ animationDelay: `${index * 100}ms` }}>
            <StatCard
              {...config}
              loading={loading}
            />
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
