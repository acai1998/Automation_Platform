import { useEffect, useState, useRef } from "react";
import { MoreVertical, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DashboardResponse } from "@/types/dashboard";

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

interface RecentTestsProps {
  data?: DashboardResponse;
  initialData?: RecentRun[];
  onRefresh?: () => Promise<void>;
}

export function RecentTests({ data, initialData, onRefresh }: RecentTestsProps) {
  const [, setLocation] = useLocation();
  const [runs, setRuns] = useState<RecentRun[]>(() => initialData || []);
  const [loading, setLoading] = useState(() => !initialData);
  const parentRef = useRef<HTMLDivElement>(null);

  // 使用虚拟滚动优化性能 - 确保只在有数据时初始化
  const rowVirtualizer = useVirtualizer({
    count: runs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76, // 每行高度估计值，增加以适应移动端的额外信息
    overscan: 5, // 预渲染额外行数
  });

  useEffect(() => {
    if (data?.recentRuns) {
      setRuns(data.recentRuns);
      setLoading(false);
    }
  }, [data]);

  const handleRefresh = async () => {
    if (onRefresh) {
      setLoading(true);
      try {
        await onRefresh();
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-900 dark:text-white text-xl font-bold tracking-tight">
          最近测试运行
        </h2>
        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>刷新</span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocation('/reports')}
            className="text-primary text-sm font-semibold hover:text-primary/80 transition-colors"
          >
            查看所有报告
          </button>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark transition-all duration-200 hover:shadow-lg hover:border-primary/10">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-gray-400">
            暂无测试运行记录
          </div>
        ) : (
          <div className="relative">
            {/* 固定的表头 */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_2fr_auto_auto_auto] md:grid-cols-[auto_2fr_auto_auto_auto_auto] border-b border-slate-100 dark:border-border-dark bg-slate-50 dark:bg-black/20 gap-2 sm:gap-3">
              {/* 状态列 */}
              <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[70px]">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">状态</div>
              </div>
              {/* 计划名称列 */}
              <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">计划名称</div>
              </div>
              {/* 耗时列 */}
              <div className="px-2 py-2 sm:px-3 sm:py-3 w-20 hidden sm:block">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">耗时</div>
              </div>
              {/* 执行者列 */}
              <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[80px]">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">执行者</div>
              </div>
              {/* 时间列 - 中屏以下隐藏 */}
              <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[70px] hidden md:block">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">时间</div>
              </div>
              {/* 操作列 */}
              <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[50px] flex justify-end">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">操作</div>
              </div>
            </div>

            {/* 虚拟滚动的表体 */}
            <div
              ref={parentRef}
              className="h-[600px] overflow-auto"
              style={{
                contain: 'strict'
              }}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                  const run = runs[virtualItem.index];
                  return (
                    <div
                      key={run.id}
                      className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors absolute top-0 left-0 right-0 grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_2fr_auto_auto_auto] md:grid-cols-[auto_2fr_auto_auto_auto_auto] gap-2 sm:gap-3 items-center border-b border-slate-100 dark:divide-border-dark"
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {/* 状态列 */}
                      <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[70px]">
                        <StatusBadge status={run.status} />
                      </div>
                      {/* 计划名称列 */}
                      <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {run.suiteName}
                        </div>
                        {/* 在小屏幕上显示耗时和时间信息 */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-gray-400 mt-1 sm:hidden">
                          <span>{formatDuration(run.duration)}</span>
                          <span className="md:hidden">{formatTime(run.startTime)}</span>
                        </div>
                      </div>
                      {/* 耗时列 */}
                      <div className="px-2 py-2 sm:px-3 sm:py-3 w-20 hidden sm:block">
                        <div className="text-sm text-slate-500 dark:text-gray-400 truncate">
                          {formatDuration(run.duration)}
                        </div>
                      </div>
                      {/* 执行者列 */}
                      <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[80px]">
                        <div className="flex items-center gap-2">
                          <div className={`size-5 sm:size-6 rounded-full ${ownerColors[virtualItem.index % ownerColors.length]} flex items-center justify-center text-[9px] sm:text-[10px] text-white font-bold`}>
                            {getInitials(run.executedBy || '系统')}
                          </div>
                          <span className="text-sm text-slate-600 dark:text-gray-300 truncate hidden sm:inline">{run.executedBy || '系统'}</span>
                        </div>
                      </div>
                      {/* 时间列 - 中屏以下隐藏 */}
                      <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[70px] hidden md:block">
                        <div className="text-sm text-slate-500 dark:text-gray-400">
                          {formatTime(run.startTime)}
                        </div>
                      </div>
                      {/* 操作列 */}
                      <div className="px-2 py-2 sm:px-3 sm:py-3 min-w-[50px] flex justify-end">
                        <button
                          type="button"
                          title="更多操作"
                          className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-white transition-colors"
                        >
                          <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
