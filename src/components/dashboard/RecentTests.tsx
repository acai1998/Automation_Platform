import { useEffect, useState, useRef, useMemo } from "react";
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

// Grid 布局配置常量
const GRID_CONFIG = {
  // 列宽配置（基于内容需求设计）
  columns: {
    status: {
      medium: '90px',    // 中屏：标准状态徽章
      large: '100px',    // 大屏：更宽松的状态徽章
      ultrawide: '110px' // 超宽屏：更充足的空间
    },
    name: '1fr',         // 名称列：始终自适应剩余空间
    duration: {
      medium: '100px',   // 中屏：容纳"99m 59s"
      large: '110px',    // 大屏：更宽松的数字显示
      ultrawide: '120px' // 超宽屏：更充足的数字空间
    },
    executor: {
      medium: '130px',   // 中屏：容纳头像+姓名
      large: '140px',    // 大屏：更宽松的执行者信息
      ultrawide: '160px' // 超宽屏：更充足的执行者空间
    },
    time: {
      medium: '120px',   // 中屏：容纳相对时间
      large: '130px',    // 大屏：更宽松的时间显示
      ultrawide: '140px' // 超宽屏：更充足的时间空间
    },
    actions: {
      medium: '70px',    // 中屏：基本操作按钮
      large: '80px',     // 大屏：更宽松的操作区域
      ultrawide: '90px'  // 超宽屏：更充足的操作空间
    }
  },
  // Grid 模板字符串（平均分配间距）
  templates: {
    medium: '1fr 2fr 1fr 1.5fr 1fr',                    // 中屏PC (768px-1279px): 5列平均分配
    large: '1fr 2fr 1fr 1.5fr 1fr 1fr',                 // 大屏PC (1280px-1919px): 6列平均分配
    ultrawide: '1fr 2fr 1fr 1.5fr 1fr 1fr'              // 超宽屏 (1920px+): 6列平均分配
  },
  // 响应式断点
  breakpoints: {
    medium: '768px',     // 中屏PC起始点
    large: '1280px',     // 大屏PC起始点
    ultrawide: '1920px'  // 超宽屏起始点
  }
} as const;

// 列标题配置（支持国际化）
const COLUMN_LABELS = {
  status: '状态',
  name: '计划名称',
  duration: '耗时',
  executor: '执行者',
  time: '时间',
  actions: '操作'
} as const;

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

// 响应式Grid模板Hook
function useResponsiveGrid() {
  const [screenSize, setScreenSize] = useState<'medium' | 'large' | 'ultrawide'>('large');

  useEffect(() => {
    const updateScreenSize = () => {
      const width = window.innerWidth;
      if (width >= 1920) {
        setScreenSize('ultrawide');
      } else if (width >= 1280) {
        setScreenSize('large');
      } else {
        setScreenSize('medium');
      }
    };

    // 初始化
    updateScreenSize();

    // 监听窗口大小变化
    window.addEventListener('resize', updateScreenSize);
    return () => window.removeEventListener('resize', updateScreenSize);
  }, []);

  const gridTemplate = useMemo(() => {
    return GRID_CONFIG.templates[screenSize];
  }, [screenSize]);

  const showTimeColumn = screenSize !== 'medium';

  return { gridTemplate, showTimeColumn, screenSize };
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

  // 响应式Grid布局
  const { gridTemplate, showTimeColumn } = useResponsiveGrid();

  // 使用虚拟滚动优化性能 - PC端专用
  const rowVirtualizer = useVirtualizer({
    count: runs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // PC端行高估计值
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
            {/* 固定的表头 - PC端专用 */}
            <div
              className="grid border-b border-slate-100 dark:border-border-dark bg-slate-50 dark:bg-black/20"
              style={{ gridTemplateColumns: gridTemplate }}
              role="row"
              aria-label="表格标题行"
            >
              {/* 状态列 */}
              <div className="px-4 py-3" role="columnheader" aria-sort="none">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {COLUMN_LABELS.status}
                </div>
              </div>
              {/* 计划名称列 */}
              <div className="px-4 py-3" role="columnheader" aria-sort="none">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {COLUMN_LABELS.name}
                </div>
              </div>
              {/* 耗时列 */}
              <div className="px-4 py-3 flex justify-center" role="columnheader" aria-sort="none">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {COLUMN_LABELS.duration}
                </div>
              </div>
              {/* 执行者列 */}
              <div className="px-4 py-3" role="columnheader" aria-sort="none">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {COLUMN_LABELS.executor}
                </div>
              </div>
              {/* 时间列 - 根据屏幕尺寸动态显示 */}
              {showTimeColumn && (
                <div className="px-4 py-3 flex justify-center" role="columnheader" aria-sort="none">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                    {COLUMN_LABELS.time}
                  </div>
                </div>
              )}
              {/* 操作列 */}
              <div className="px-4 py-3 flex justify-end" role="columnheader">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {COLUMN_LABELS.actions}
                </div>
              </div>
            </div>

            {/* 虚拟滚动的表体 */}
            <div
              ref={parentRef}
              className="h-[600px] overflow-auto"
              style={{
                contain: 'strict'
              }}
              role="rowgroup"
              aria-label="测试运行记录列表"
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
                      className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-all duration-150 ease-in-out absolute top-0 left-0 right-0 grid items-center border-b border-slate-100 dark:border-border-dark"
                      style={{
                        gridTemplateColumns: gridTemplate,
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      role="row"
                      aria-label={`测试运行: ${run.suiteName}`}
                    >
                      {/* 状态列 */}
                      <div className="px-4 py-3" role="cell" aria-label={`状态: ${statusConfig[run.status].label}`}>
                        <StatusBadge status={run.status} />
                      </div>
                      {/* 计划名称列 */}
                      <div className="px-4 py-3" role="cell" aria-label={`计划名称: ${run.suiteName}`}>
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {run.suiteName}
                        </div>
                      </div>
                      {/* 耗时列 */}
                      <div className="px-4 py-3 flex justify-center" role="cell" aria-label={`耗时: ${formatDuration(run.duration)}`}>
                        <div className="text-sm text-slate-500 dark:text-gray-400">
                          {formatDuration(run.duration)}
                        </div>
                      </div>
                      {/* 执行者列 */}
                      <div className="px-4 py-3" role="cell" aria-label={`执行者: ${run.executedBy || '系统'}`}>
                        <div className="flex items-center gap-2">
                          <div
                            className={`size-6 rounded-full ${ownerColors[virtualItem.index % ownerColors.length]} flex items-center justify-center text-[10px] text-white font-bold`}
                            aria-hidden="true"
                          >
                            {getInitials(run.executedBy || '系统')}
                          </div>
                          <span className="text-sm text-slate-600 dark:text-gray-300 truncate">{run.executedBy || '系统'}</span>
                        </div>
                      </div>
                      {/* 时间列 - 根据屏幕尺寸动态显示 */}
                      {showTimeColumn && (
                        <div className="px-4 py-3 flex justify-center" role="cell" aria-label={`时间: ${formatTime(run.startTime)}`}>
                          <div className="text-sm text-slate-500 dark:text-gray-400">
                            {formatTime(run.startTime)}
                          </div>
                        </div>
                      )}
                      {/* 操作列 */}
                      <div className="px-4 py-3 flex justify-end" role="cell">
                        <button
                          type="button"
                          aria-label={`${run.suiteName}的更多操作`}
                          className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
                        >
                          <MoreVertical className="h-5 w-5" aria-hidden="true" />
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
