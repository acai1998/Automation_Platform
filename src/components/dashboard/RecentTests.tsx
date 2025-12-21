import { useEffect, useState } from "react";
import { MoreVertical, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { dashboardApi } from "@/lib/api";

interface RecentRun {
  id: number;
  suiteName: string;
  status: TestStatus;
  duration: number | null;
  startTime: string;
  executedBy: string | null;
}

type TestStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

const statusConfig: Record<TestStatus, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  pending: {
    label: '等待中',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-500',
    dotColor: 'bg-slate-500',
  },
  running: {
    label: '运行中',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
    dotColor: 'bg-blue-500',
  },
  success: {
    label: '成功',
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    dotColor: 'bg-success',
  },
  failed: {
    label: '失败',
    bgColor: 'bg-danger/10',
    textColor: 'text-danger',
    dotColor: 'bg-danger',
  },
  cancelled: {
    label: '已取消',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-500',
    dotColor: 'bg-slate-500',
  },
};

const ownerColors = [
  'bg-indigo-500',
  'bg-pink-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-blue-500',
  'bg-red-500',
  'bg-teal-500',
];

function StatusBadge({ status }: { status: TestStatus }) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${config.bgColor} px-2.5 py-1 text-xs font-medium ${config.textColor}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor} ${status === 'running' ? 'animate-pulse' : ''}`}></span>
      {config.label}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

function getInitials(name: string): string {
  if (!name) return '?';
  // 处理中文名字
  if (/[\u4e00-\u9fa5]/.test(name)) {
    return name.slice(0, 2);
  }
  // 处理英文名字
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function RecentTests() {
  const [, setLocation] = useLocation();
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await dashboardApi.getRecentRuns(10);
        if (response.success && response.data) {
          setRuns(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch recent runs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-900 dark:text-white text-xl font-bold tracking-tight">
          最近测试运行
        </h2>
        <button
          type="button"
          onClick={() => setLocation('/reports')}
          className="text-primary text-sm font-semibold hover:text-primary/80 transition-colors"
        >
          查看所有报告
        </button>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-[#234833] bg-white dark:bg-surface-dark">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-gray-400">
            暂无测试运行记录
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#234833] bg-slate-50 dark:bg-black/20">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">状态</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">套件名称</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">耗时</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">执行者</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">时间</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#234833]">
              {runs.map((run, index) => (
                <tr key={run.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-900 dark:text-white">
                    {run.suiteName}
                  </td>
                  <td className="p-4 text-sm text-slate-500 dark:text-gray-400">
                    {formatDuration(run.duration)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className={`size-6 rounded-full ${ownerColors[index % ownerColors.length]} flex items-center justify-center text-[10px] text-white font-bold`}>
                        {getInitials(run.executedBy || '系统')}
                      </div>
                      <span className="text-sm text-slate-600 dark:text-gray-300">{run.executedBy || '系统'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-500 dark:text-gray-400">
                    {formatTime(run.startTime)}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      title="更多操作"
                      className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
