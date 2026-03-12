import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Boxes,
  Play,
  AlertCircle,
  Loader2,
  MoreVertical,
  Calendar,
  Globe,
  BarChart3,
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useTasks,
  useRunTask,
  useCreateTask,
  useUpdateTask,
  useUpdateTaskStatus,
  useDeleteTask,
  type Task,
  type TaskExecution,
  type CreateTaskInput,
  type TaskListParams,
} from '@/hooks/useTasks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ─── 常量 ─────────────────────────────────────────── */

const PAGE_SIZE = 12;

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  manual: '手动',
  scheduled: '定时',
  ci_triggered: 'CI',
};

const STATUS_LABELS: Record<string, string> = {
  active: '活跃',
  paused: '暂停',
  archived: '已归档',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

/* ─── 主页面 ─────────────────────────────────────────── */

export default function Tasks() {
  // ── 筛选 & 分页状态 ──────────────────────────────────
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [page, setPage] = useState(1);

  // 防抖 keyword
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [keyword]);

  const queryParams: TaskListParams = useMemo(
    () => ({
      keyword: debouncedKeyword || undefined,
      status: statusFilter || undefined,
      triggerType: triggerFilter || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [debouncedKeyword, statusFilter, triggerFilter, page]
  );

  const { data: result, isLoading, error, refetch } = useTasks(queryParams);
  const tasks = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── 操作 mutation ──────────────────────────────────
  const runTaskMutation = useRunTask();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const updateStatusMutation = useUpdateTaskStatus();
  const deleteTaskMutation = useDeleteTask();

  // ── 弹窗控制 ──────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // ── 统计 ──────────────────────────────────────────
  const stats = useMemo(() => {
    if (!tasks.length) return { total, active: 0, todayRuns: 0 };
    const today = new Date().toISOString().split('T')[0];
    return {
      total,
      active: tasks.filter((t) => t.status === 'active').length,
      todayRuns: tasks.reduce(
        (acc, t) =>
          acc + (t.recentExecutions?.filter((e) => e.start_time?.startsWith(today)).length ?? 0),
        0
      ),
    };
  }, [tasks, total]);

  // ── 处理函数 ──────────────────────────────────────
  const handleRunTask = async (taskId: number, taskName: string) => {
    try {
      await runTaskMutation.mutateAsync(taskId);
      toast.success(`任务 "${taskName}" 已开始执行`, {
        description: '执行任务已创建，请稍后在报告中心查看结果',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '触发失败');
    }
  };

  const handleSaveTask = async (input: CreateTaskInput & { id?: number }) => {
    try {
      if (input.id) {
        await updateTaskMutation.mutateAsync({ id: input.id, ...input });
        toast.success('任务更新成功');
      } else {
        await createTaskMutation.mutateAsync(input);
        toast.success('任务创建成功');
      }
      setFormOpen(false);
      setEditingTask(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    try {
      await updateStatusMutation.mutateAsync({ id: task.id, status: newStatus });
      toast.success(`任务已${newStatus === 'active' ? '启用' : '暂停'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '状态切换失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTaskMutation.mutateAsync(deleteTarget.id);
      toast.success(`任务 "${deleteTarget.name}" 已删除`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const clearFilters = () => {
    setKeyword('');
    setDebouncedKeyword('');
    setStatusFilter('');
    setTriggerFilter('');
    setPage(1);
  };

  const hasActiveFilters = keyword || statusFilter || triggerFilter;

  // ── 渲染 ──────────────────────────────────────────
  return (
    <div className="space-y-8 p-6">
      {/* 顶部标题 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Boxes className="h-8 w-8 text-blue-600" />
            任务管理
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            调度、执行和监控自动化测试任务
          </p>
        </div>
        <Button
          className="gap-2 shadow-lg shadow-blue-500/20"
          onClick={() => {
            setEditingTask(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-100 dark:border-blue-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-600 dark:text-blue-400 font-medium">
              总任务数
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-100 dark:border-green-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-green-600 dark:text-green-400 font-medium">
              活跃任务
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.active}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-transparent border-purple-100 dark:border-purple-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-purple-600 dark:text-purple-400 font-medium">
              今日运行
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.todayRuns}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* 关键字搜索 */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索任务名称..."
            className="pl-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          {(['', 'active', 'paused', 'archived'] as const).map((v) => (
            <Button
              key={v}
              variant={statusFilter === v ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatusFilter(v);
                setPage(1);
              }}
              className="h-8"
            >
              {v === '' ? '全部状态' : STATUS_LABELS[v]}
            </Button>
          ))}
        </div>

        {/* 触发类型筛选 */}
        <div className="flex items-center gap-2">
          {(['', 'manual', 'scheduled', 'ci_triggered'] as const).map((v) => (
            <Button
              key={v}
              variant={triggerFilter === v ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTriggerFilter(v);
                setPage(1);
              }}
              className="h-8"
            >
              {v === '' ? '全部触发' : TRIGGER_TYPE_LABELS[v]}
            </Button>
          ))}
        </div>

        {/* 清除筛选 */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-slate-500">
            <X className="h-3.5 w-3.5" />
            清除
          </Button>
        )}

        {/* 刷新按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-auto"
          onClick={() => refetch()}
          title="刷新"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* 加载 / 错误 / 任务列表 */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          <p className="text-slate-500 animate-pulse">正在加载任务列表...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-4">
          <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <p className="text-red-600 font-medium">加载失败: {(error as Error).message}</p>
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-4 text-slate-400">
          <Boxes className="h-16 w-16 opacity-30" />
          <p className="text-lg">
            {hasActiveFilters ? '没有符合条件的任务' : '暂无任务，点击「新建任务」开始吧'}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              清除筛选
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onRun={() => handleRunTask(task.id, task.name)}
                onEdit={() => {
                  setEditingTask(task);
                  setFormOpen(true);
                }}
                onToggleStatus={() => handleToggleStatus(task)}
                onDelete={() => setDeleteTarget(task)}
                isRunning={
                  runTaskMutation.isPending &&
                  runTaskMutation.variables === task.id
                }
              />
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-slate-500">
                共 {total} 条，第 {page} / {totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2
                  )
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-2 text-slate-400">
                        …
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={page === p ? 'default' : 'outline'}
                        size="icon"
                        className="h-8 w-8 text-xs"
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 新建/编辑 弹窗 */}
      <TaskFormDialog
        open={formOpen}
        task={editingTask}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        isSaving={createTaskMutation.isPending || updateTaskMutation.isPending}
      />

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除任务</DialogTitle>
            <DialogDescription>
              此操作不可撤销。删除后，该任务的执行记录仍会保留。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-4 border border-red-100 dark:border-red-900/30 text-sm text-red-700 dark:text-red-400">
            即将删除：<strong>{deleteTarget?.name}</strong>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteTaskMutation.isPending}
            >
              {deleteTaskMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── 任务卡片 ─────────────────────────────────────────── */

function TaskCard({
  task,
  onRun,
  onEdit,
  onToggleStatus,
  onDelete,
  isRunning,
}: {
  task: Task;
  onRun: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  isRunning?: boolean;
}) {
  const [, navigate] = useLocation();
  const lastExecution = task.recentExecutions?.[0];
  const successRate =
    lastExecution?.total_cases
      ? Math.round((lastExecution.passed_cases / lastExecution.total_cases) * 100)
      : null;

  const handleViewReport = () => {
    if (task.latestRunId) {
      navigate(`/reports/${task.latestRunId}`);
    } else {
      navigate('/reports');
    }
  };

  return (
    <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
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
              <Badge variant="outline" className="font-normal">
                {task.project_name || '未分类'}
              </Badge>
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {task.environment_name || '默认环境'}
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
              <DropdownMenuItem onClick={onEdit} className="gap-2">
                <Pencil className="h-4 w-4" />
                编辑任务
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleViewReport} className="gap-2">
                <FileText className="h-4 w-4" />
                查看报告
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleStatus} className="gap-2">
                {task.status === 'active' ? (
                  <>
                    <ToggleLeft className="h-4 w-4" />
                    暂停任务
                  </>
                ) : (
                  <>
                    <ToggleRight className="h-4 w-4" />
                    启用任务
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600 gap-2">
                <Trash2 className="h-4 w-4" />
                删除任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 min-h-[2.5rem]">
          {task.description || '暂无描述'}
        </p>

        {/* 触发类型 & 成功率 */}
        <div className="flex items-center justify-between text-sm">
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
                  successRate >= 90
                    ? 'text-green-600'
                    : successRate >= 70
                    ? 'text-orange-600'
                    : 'text-red-600'
                )}
              >
                {successRate}%
              </span>
            </div>
          )}
        </div>

        {/* 最近运行记录小圆点 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-slate-400">
            <span>最近运行</span>
            <span>{task.recentExecutions?.length ?? 0} 次记录</span>
          </div>
          <div className="flex gap-1.5 h-6 items-center">
            {task.recentExecutions && task.recentExecutions.length > 0 ? (
              task.recentExecutions.slice(0, 10).map((exec) => (
                <ExecutionStatusDot key={exec.id} execution={exec} />
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">暂无运行记录</span>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <Button
          onClick={onRun}
          disabled={isRunning || task.status === 'archived'}
          className="w-full gap-2 bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-300 dark:bg-slate-800 dark:text-blue-400 dark:border-slate-700"
          variant="outline"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          {isRunning ? '执行中...' : '立即运行'}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ─── 执行状态小圆点 ─────────────────────────────────────── */

function ExecutionStatusDot({ execution }: { execution: TaskExecution }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    success: { color: 'bg-green-500', label: '成功' },
    failed: { color: 'bg-red-500', label: '失败' },
    running: { color: 'bg-blue-500 animate-pulse', label: '运行中' },
    pending: { color: 'bg-slate-300', label: '等待中' },
    cancelled: { color: 'bg-slate-400', label: '已取消' },
  };
  const config = statusConfig[execution.status] ?? statusConfig.pending;

  return (
    <div
      className={cn(
        'w-3 h-3 rounded-full cursor-help transition-transform hover:scale-150',
        config.color
      )}
      title={`${config.label} - ${execution.start_time ?? '未知时间'}`}
    />
  );
}

/* ─── 新建 / 编辑 弹窗 ───────────────────────────────────── */

interface TaskFormDialogProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (input: CreateTaskInput & { id?: number }) => void;
  isSaving: boolean;
}

function TaskFormDialog({ open, task, onClose, onSave, isSaving }: TaskFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'manual' | 'scheduled' | 'ci_triggered'>('manual');
  const [cronExpression, setCronExpression] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 回填编辑数据
  useEffect(() => {
    if (open) {
      setName(task?.name ?? '');
      setDescription(task?.description ?? '');
      setTriggerType((task?.trigger_type as 'manual' | 'scheduled' | 'ci_triggered') ?? 'manual');
      setCronExpression(task?.cron_expression ?? '');
      setErrors({});
    }
  }, [open, task]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '任务名称不能为空';
    if (name.trim().length > 200) errs.name = '名称不能超过200个字符';
    if (triggerType === 'scheduled') {
      if (!cronExpression.trim()) {
        errs.cronExpression = '定时任务必须填写 Cron 表达式';
      } else if (cronExpression.trim().split(/\s+/).length !== 5) {
        errs.cronExpression = 'Cron 格式无效（需为标准5段，如 0 2 * * *）';
      }
    }
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSave({
      id: task?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      triggerType,
      cronExpression: triggerType === 'scheduled' ? cronExpression.trim() : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? '编辑任务' : '新建任务'}</DialogTitle>
          <DialogDescription>
            {task ? '修改任务配置，保存后立即生效。' : '填写任务信息，完成后点击保存。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 任务名称 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              任务名称 <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="请输入任务名称"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: '' }));
              }}
              className={cn(errors.name && 'border-red-400 focus-visible:ring-red-400')}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* 任务描述 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              任务描述
            </label>
            <Textarea
              placeholder="简要描述此任务的用途（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* 触发类型 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              触发方式
            </label>
            <div className="flex gap-2">
              {(
                [
                  { value: 'manual', label: '手动触发' },
                  { value: 'scheduled', label: '定时触发' },
                  { value: 'ci_triggered', label: 'CI 触发' },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTriggerType(value)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
                    triggerType === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cron 表达式（仅定时触发时显示） */}
          {triggerType === 'scheduled' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Cron 表达式 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="例：0 2 * * *（每天凌晨2点）"
                value={cronExpression}
                onChange={(e) => {
                  setCronExpression(e.target.value);
                  if (errors.cronExpression) setErrors((p) => ({ ...p, cronExpression: '' }));
                }}
                className={cn(
                  'font-mono',
                  errors.cronExpression && 'border-red-400 focus-visible:ring-red-400'
                )}
              />
              {errors.cronExpression ? (
                <p className="text-xs text-red-500">{errors.cronExpression}</p>
              ) : (
                <p className="text-xs text-slate-400">格式：分 时 日 月 周（标准5段）</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isSaving ? '保存中...' : task ? '保存修改' : '创建任务'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
