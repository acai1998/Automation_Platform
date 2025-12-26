import { useEffect, useState } from "react";
import { CheckCircle, Terminal, AlertCircle, Timer, TrendingUp, TrendingDown, Loader2, HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { dashboardApi } from "@/lib/api";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface DashboardStats {
  totalCases: number;
  todayRuns: number;
  todaySuccessRate: number | null;
  runningTasks: number;
}

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
      className={`flex flex-col gap-3 rounded-xl p-6 border border-slate-200 dark:border-[#234833] bg-white dark:bg-surface-dark shadow-sm stat-card ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className={`p-2 ${iconBg} rounded-lg ${iconColor}`}>
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
              <TooltipContent side="top" className="max-w-xs">
                <div className="text-slate-600 dark:text-gray-400 text-sm">
                  {description}
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          {trend && !loading && (
            <span
              className={`text-xs font-bold px-2 py-1 rounded flex items-center gap-1 ${
                trend.isPositive
                  ? "text-success bg-success/10"
                  : "text-danger bg-danger/10"
              }`}
            >
              {trend.value}
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>
      <div>
        <p className="text-slate-500 dark:text-gray-400 text-sm font-medium mb-1">{label}</p>
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <p className="text-slate-900 dark:text-white text-3xl font-bold tracking-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

export function StatsCards() {
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await dashboardApi.getStats();
        if (response.success && response.data) {
          setStats(response.data);
        }
      } catch (err: any) {
        setError(err.message);
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // 每30秒刷新一次
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Cases */}
      <StatCard
        icon={<Terminal className="h-5 w-5" />}
        iconBg="bg-blue-500/10"
        iconColor="text-blue-500"
        label="自动化用例总数"
        value={stats?.totalCases.toLocaleString() ?? '-'}
        loading={loading}
        onClick={() => setLocation('/cases')}
        description="统计项目中已创建的自动化用例总数，包含所有状态的用例。"
      />

      {/* Today Runs */}
      <StatCard
        icon={<CheckCircle className="h-5 w-5" />}
        iconBg="bg-primary/10"
        iconColor="text-primary"
        label="今日执行总次数"
        value={stats?.todayRuns.toString() ?? '-'}
        loading={loading}
        description="显示今天内完成的所有测试执行次数，包括成功和失败的执行。用于评估团队的测试执行频率和工作量。"
      />

      {/* Success Rate */}
      <StatCard
        icon={<AlertCircle className="h-5 w-5" />}
        iconBg={stats && stats.todaySuccessRate !== null && stats.todaySuccessRate < 80 ? "bg-danger/10" : "bg-success/10"}
        iconColor={stats && stats.todaySuccessRate !== null && stats.todaySuccessRate < 80 ? "text-danger" : "text-success"}
        label="今日成功率%"
        value={stats && stats.todaySuccessRate !== null ? `${stats.todaySuccessRate}%` : '60%'}
        loading={loading}
        description="基于今日完成的测试执行计算的成功率，低于 80% 会显示为警示颜色。"
      />

      {/* Running Tasks */}
      <StatCard
        icon={<Timer className="h-5 w-5" />}
        iconBg="bg-warning/10"
        iconColor="text-warning"
        label="当前运行中任务"
        value={stats?.runningTasks.toString() ?? '-'}
        loading={loading}
        onClick={() => setLocation('/tasks')}
        description="当前正在执行或调度中的任务数量，用于监控并发执行情况和资源占用。"
      />
      </div>
    </TooltipProvider>
  );
}
