import { memo, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  BarChart3,
  Calendar,
  Clock,
  FileText,
  ListChecks,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CheckedState } from '@radix-ui/react-checkbox';
import type { Task, TaskExecution } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import {
  EXECUTION_STATUS_CONFIG,
  STATUS_COLORS,
  STATUS_LABELS,
  SUCCESS_RATE_THRESHOLDS,
  TASKS_CONFIG,
  TRIGGER_TYPE_LABELS,
} from '@/constants/tasks';
import { TASK_MESSAGES, TASK_PAGE } from '@/constants/messages';

interface TaskCardProps {
  task: Task;
  onRunTask: (taskId: number, taskName: string) => void;
  onEditTask: (task: Task) => void;
  onToggleStatus: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onStatsTask: (task: Task) => void;
  onCancelTask: (task: Task) => void;
  isRunning?: boolean;
  /** [P1] 任务是否在调度器等待队列中 */
  isQueued?: boolean;
  /** [P1] 在队列中的位置（1-based） */
  queuePosition?: number;
  isBatchMode?: boolean;
  isSelected?: boolean;
  onSelectTask?: (taskId: number, checked: CheckedState) => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  onRunTask,
  onEditTask,
  onToggleStatus,
  onDeleteTask,
  onStatsTask,
  onCancelTask,
  isRunning,
  isQueued,
  queuePosition,
  isBatchMode,
  isSelected,
  onSelectTask,
}: TaskCardProps) {
  const [, navigate] = useLocation();
  const lastExecution = task.recentExecutions?.[0];
  const successRate =
    lastExecution?.total_cases
      ? Math.round((lastExecution.passed_cases / lastExecution.total_cases) * 100)
      : null;

  // 是否有正在运行的执行（用于显示「取消」按钮）
  const hasActiveExecution = task.recentExecutions?.some(
    (e) => e.status === 'pending' || e.status === 'running'
  ) ?? false;

  // 解析关联用例数量（useMemo 避免每次渲染重复 JSON.parse）
  const caseCount = useMemo(() => {
    if (!task.case_ids) return 0;
    try {
      const ids = JSON.parse(task.case_ids);
      return Array.isArray(ids) ? ids.length : 0;
    } catch {
      return 0;
    }
  }, [task.case_ids]);

  const handleViewReport = useCallback(() => {
    if (task.latestRunId) {
      navigate(`/reports/${task.latestRunId}`);
    } else {
      navigate('/reports');
    }
  }, [navigate, task.latestRunId]);

  const handleRun = useCallback(() => {
    onRunTask(task.id, task.name);
  }, [onRunTask, task.id, task.name]);

  const handleEdit = useCallback(() => {
    onEditTask(task);
  }, [onEditTask, task]);

  const handleToggle = useCallback(() => {
    onToggleStatus(task);
  }, [onToggleStatus, task]);

  const handleDelete = useCallback(() => {
    onDeleteTask(task);
  }, [onDeleteTask, task]);

  const handleStats = useCallback(() => {
    onStatsTask(task);
  }, [onStatsTask, task]);

  const handleCancel = useCallback(() => {
    onCancelTask(task);
  }, [onCancelTask, task]);

  const handleSelect = useCallback((checked: CheckedState) => {
    onSelectTask?.(task.id, checked);
  }, [onSelectTask, task.id]);

  return (
    <Card className={cn(
      "group hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col hover:-translate-y-0.5",
      isSelected && "ring-2 ring-blue-500 border-blue-500"
    )}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-2">
          {/* 批量模式下显示复选框 */}
          {isBatchMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleSelect}
              className="mt-1 shrink-0"
            />
          )}
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-xl font-bold group-hover:text-blue-600 transition-colors truncate">
              {task.name}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {/* 状态 Badge */}
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs',
                  STATUS_COLORS[task.status] ?? STATUS_COLORS.active
                )}
              >
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit} className="gap-2">
                <Pencil className="h-4 w-4" />
                {TASK_MESSAGES.BTN_EDIT_TASK}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleViewReport} className="gap-2">
                <FileText className="h-4 w-4" />
                {TASK_MESSAGES.BTN_VIEW_REPORT}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleStats} className="gap-2">
                <TrendingUp className="h-4 w-4" />
                查看统计
              </DropdownMenuItem>
              {hasActiveExecution && (
                <DropdownMenuItem onClick={handleCancel} className="gap-2 text-orange-600">
                  <XCircle className="h-4 w-4" />
                  取消运行
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleToggle} className="gap-2">
                {task.status === 'active' ? (
                  <>
                    <ToggleLeft className="h-4 w-4" />
                    {TASK_MESSAGES.BTN_PAUSE_TASK}
                  </>
                ) : (
                  <>
                    <ToggleRight className="h-4 w-4" />
                    {TASK_MESSAGES.BTN_ENABLE_TASK}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-red-600 gap-2">
                <Trash2 className="h-4 w-4" />
                {TASK_MESSAGES.BTN_DELETE_TASK}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[2.5rem]">
          {task.description || TASK_MESSAGES.NO_DESCRIPTION}
        </p>

        {/* 触发类型 & 成功率 */}
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Calendar className="h-4 w-4" />
            <span>
              {task.trigger_type === 'scheduled'
                ? (task.cron_expression || '定时')
                : TRIGGER_TYPE_LABELS[task.trigger_type] ?? task.trigger_type}
            </span>
          </div>
          {successRate !== null && (
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <span
                className={cn(
                  'font-bold',
                  successRate >= SUCCESS_RATE_THRESHOLDS.HIGH
                    ? 'text-green-600'
                    : successRate >= SUCCESS_RATE_THRESHOLDS.MEDIUM
                    ? 'text-orange-600'
                    : 'text-red-600'
                )}
              >
                {successRate}%
              </span>
            </div>
          )}
        </div>

        {/* 关联用例数量 */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ListChecks className="h-3.5 w-3.5" />
          {caseCount > 0 ? (
            <span>
              已关联 <span className="font-semibold text-slate-600 dark:text-slate-300">{caseCount}</span> 个用例
            </span>
          ) : (
            <span className="italic text-amber-500">暂无关联用例</span>
          )}
        </div>

        {/* 最近运行记录小圆点 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400">
            <span>{TASK_PAGE.RECENT_RUNS_LABEL}</span>
            <span>{TASK_PAGE.RECENT_RUNS_COUNT(task.recentExecutions?.length ?? 0)}</span>
          </div>
          <div className="flex gap-1.5 h-6 items-center">
            {task.recentExecutions && task.recentExecutions.length > 0 ? (
              task.recentExecutions.slice(0, TASKS_CONFIG.RECENT_EXECUTIONS_DISPLAY).map((exec) => (
                <ExecutionStatusDot key={exec.id} execution={exec} />
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">{TASK_MESSAGES.NO_RECENT_EXECUTIONS}</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <Button
          onClick={handleRun}
          disabled={isRunning || isQueued || task.status === 'archived'}
          className={cn(
            "w-full gap-2",
            isQueued
              ? "bg-amber-50 hover:bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700"
              : "bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-300 dark:bg-slate-800 dark:text-blue-400 dark:border-slate-700"
          )}
          variant="outline"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isQueued ? (
            <Clock className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          {isRunning
            ? TASK_MESSAGES.BTN_RUNNING
            : isQueued
            ? `排队中 ${queuePosition ? `(第 ${queuePosition} 位)` : ''}`
            : TASK_MESSAGES.BTN_RUN_NOW}
        </Button>
      </CardFooter>
    </Card>
  );
});

TaskCard.displayName = 'TaskCard';

/* ─── 执行状态小圆点 ─────────────────────────────────────── */

function ExecutionStatusDot({ execution }: { execution: TaskExecution }) {
  // 使用 EXECUTION_STATUS_CONFIG 集中管理状态样式，避免重复定义
  const config = EXECUTION_STATUS_CONFIG[execution.status] ?? EXECUTION_STATUS_CONFIG.pending;

  return (
    <div
      role="img"
      className={cn(
        'w-3 h-3 rounded-full cursor-help transition-transform hover:scale-150',
        config.color
      )}
      title={`${config.label} - ${execution.start_time ?? '未知时间'}`}
      aria-label={`${config.label} - ${execution.start_time ?? '未知时间'}`}
    />
  );
}
