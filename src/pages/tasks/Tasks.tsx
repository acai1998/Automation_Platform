import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { BatchConfirmDialog } from '@/components/tasks/BatchConfirmDialog';
import {
  useBatchDeleteTask,
  useBatchRunTask,
  useBatchUpdateTaskStatus,
  useCancelExecution,
  useCreateTask,
  useDeleteTask,
  useRunTask,
  useSchedulerStatus,
  useTasks,
  useUpdateTask,
  useUpdateTaskStatus,
  type BatchOperationResult,
  type CreateTaskInput,
  type Task,
  type TaskListParams,
} from '@/hooks/useTasks';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { toast } from 'sonner';
import {
  STATUS_LABELS,
  SUCCESS_RATE_THRESHOLDS,
  TASKS_CONFIG,
  TRIGGER_TYPE_LABELS,
} from '@/constants/tasks';
import { TASK_MESSAGES, TASK_PAGE } from '@/constants/messages';
import { FilterGroup } from './components/FilterGroup';
import { SchedulerMonitorDialog } from './components/SchedulerMonitorDialog';
import { TaskCard } from './components/TaskCard';
import { TaskFormDialog } from './components/TaskFormDialog';
import { TaskStatsDialog } from './components/TaskStatsDialog';
import { TaskTableView } from './components/TaskTableView';
import {
  TASK_FILTER_PRESET_KEY,
  TASK_STATUS_FILTER_OPTIONS,
  TASK_TAG_FILTER_OPTIONS,
  TASK_TRIGGER_FILTER_OPTIONS,
  getTaskSemanticStatus,
  getTaskSuccessRate,
  getErrorMessage,
  isCheckedState,
  parseCaseCount,
  type SortDirection,
  type TaskSortKey,
  type TaskStatusFilter,
  type TaskTagFilter,
  type TaskTriggerFilter,
  type TaskViewMode,
} from './components/taskPageConfig';

export default function Tasks() {
  // ── 筛选 & 分页状态 ──────────────────────────────────
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('');
  const [triggerFilter, setTriggerFilter] = useState<TaskTriggerFilter>('');
  const [tagFilter, setTagFilter] = useState<TaskTagFilter>('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<TaskViewMode>('cards');
  const [sortKey, setSortKey] = useState<TaskSortKey>('latestRun');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [savedFilters, setSavedFilters] = useState<Array<{
    name: string;
    keyword: string;
    statusFilter: TaskStatusFilter;
    triggerFilter: TaskTriggerFilter;
    tagFilter: TaskTagFilter;
  }>>(() => {
    try {
      const raw = localStorage.getItem(TASK_FILTER_PRESET_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const [filterNameDialogOpen, setFilterNameDialogOpen] = useState(false);
  const [filterNameInput, setFilterNameInput] = useState('');
  const columnVisibility: Record<TaskSortKey, boolean> = {
    name: true,
    status: true,
    trigger: true,
    owner: true,
    latestRun: true,
    successRate: true,
  };

  useEffect(() => {
    try {
      localStorage.setItem(TASK_FILTER_PRESET_KEY, JSON.stringify(savedFilters));
    } catch {
      // ignore storage failure
    }
  }, [savedFilters]);

  const saveCurrentFilter = useCallback(() => {
    setFilterNameInput('');
    setFilterNameDialogOpen(true);
  }, []);

  const handleSaveFilterConfirm = useCallback(() => {
    const name = filterNameInput.trim();
    if (!name) return;

    const preset = {
      name,
      keyword,
      statusFilter,
      triggerFilter,
      tagFilter,
    };

    setSavedFilters((prev) => {
      const withoutDuplicate = prev.filter((item) => item.name !== preset.name);
      return [preset, ...withoutDuplicate].slice(0, 6);
    });
    setFilterNameDialogOpen(false);
    toast.success(`已保存常用筛选：${preset.name}`);
  }, [filterNameInput, keyword, statusFilter, triggerFilter, tagFilter]);

  const applySavedFilter = useCallback((name: string) => {
    const target = savedFilters.find((item) => item.name === name);
    if (!target) return;
    setKeyword(target.keyword);
    setDebouncedKeyword(target.keyword);
    setStatusFilter(target.statusFilter);
    setTriggerFilter(target.triggerFilter);
    setTagFilter(target.tagFilter);
    setPage(1);
  }, [savedFilters]);

  const removeSavedFilter = useCallback((name: string) => {
    setSavedFilters((prev) => prev.filter((item) => item.name !== name));
  }, []);

  const toggleSort = useCallback((key: TaskSortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('asc');
      return key;
    });
  }, []);

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
      limit: TASKS_CONFIG.PAGE_SIZE,
      offset: (page - 1) * TASKS_CONFIG.PAGE_SIZE,
    }),
    [debouncedKeyword, statusFilter, triggerFilter, page]
  );

  const { data: result, isLoading, error, refetch } = useTasks(queryParams);
  const tasks = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TASKS_CONFIG.PAGE_SIZE));
  const globalStats = result?.stats;

  // [P1] 调度器状态轮询（每 10 秒刷新一次，用于展示排队中状态）
  const { data: schedulerStatus } = useSchedulerStatus();

  // [P1] 根据调度器状态计算任务的排队信息
  const queueInfoByTaskId = useMemo(() => {
    const map = new Map<number, { isQueued: boolean; queuePosition: number }>();
    if (schedulerStatus?.queued) {
      for (const item of schedulerStatus.queued) {
        map.set(item.taskId, { isQueued: true, queuePosition: item.queuePosition });
      }
    }
    return map;
  }, [schedulerStatus]);

  // ── 操作 mutation ──────────────────────────────────
  const runTaskMutation = useRunTask();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const updateStatusMutation = useUpdateTaskStatus();
  const deleteTaskMutation = useDeleteTask();
  const cancelExecutionMutation = useCancelExecution();

  // ── 批量操作 mutation ──────────────────────────────────
  const batchUpdateStatusMutation = useBatchUpdateTaskStatus();
  const batchDeleteMutation = useBatchDeleteTask();
  const batchRunMutation = useBatchRunTask();

  // ── 弹窗控制 ──────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [statsTarget, setStatsTarget] = useState<Task | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);

  // ── 批量操作状态 ──────────────────────────────────────
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchDialog, setBatchDialog] = useState<{
    open: boolean;
    action: 'activate' | 'pause' | 'delete' | 'run';
  } | null>(null);

  // ── 统计（使用全局统计数据，避免分页导致的数据不一致） ──────────────────────────────────────────
  const stats = useMemo(() => {
    return {
      total,
      active: globalStats?.activeCount ?? 0,
      todayRuns: globalStats?.todayRuns ?? 0,
    };
  }, [total, globalStats]);

  // ── 处理函数（使用 useCallback 优化性能） ──────────────────────────────────────
  const handleRunTask = useCallback(async (taskId: number, taskName: string) => {
    try {
      await runTaskMutation.mutateAsync(taskId);
      toast.success(TASK_MESSAGES.RUN_SUCCESS(taskName), {
        description: TASK_MESSAGES.RUN_SUCCESS_DESC,
      });
    } catch (err) {
      console.error('[Tasks] Failed to run task:', { taskId, taskName, error: err });
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(TASK_MESSAGES.RUN_ERROR, {
        description: message.length > 100 ? TASK_MESSAGES.GENERIC_ERROR : message,
      });
    }
  }, [runTaskMutation]);

  const handleCancelLatestExecution = useCallback(async (task: Task) => {
    const runningExec = task.recentExecutions?.find(
      (e) => e.status === 'pending' || e.status === 'running'
    );
    if (!runningExec) {
      toast.info('没有可取消的运行中执行');
      return;
    }
    try {
      await cancelExecutionMutation.mutateAsync({ taskId: task.id, execId: runningExec.id });
      toast.success('执行已取消');
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error('取消失败', { description: message });
    }
  }, [cancelExecutionMutation]);

  const handleSaveTask = useCallback(async (input: CreateTaskInput & { id?: number }) => {
    try {
      if (input.id) {
        await updateTaskMutation.mutateAsync({ id: input.id, ...input });
        toast.success(TASK_MESSAGES.UPDATE_SUCCESS);
      } else {
        await createTaskMutation.mutateAsync(input);
        toast.success(TASK_MESSAGES.CREATE_SUCCESS);
      }
      setFormOpen(false);
      setEditingTask(null);
    } catch (err) {
      console.error('[Tasks] Failed to save task:', { input, error: err });
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(input.id ? TASK_MESSAGES.UPDATE_ERROR : TASK_MESSAGES.CREATE_ERROR, {
        description: message.length > 100 ? TASK_MESSAGES.INPUT_ERROR : message,
      });
    }
  }, [createTaskMutation, updateTaskMutation]);

  const handleToggleStatus = useCallback(async (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    try {
      // 乐观更新会在 onMutate 中自动发生，UI 立即响应
      await updateStatusMutation.mutateAsync({ id: task.id, status: newStatus });
      // 只在服务器确认后显示成功提示
      toast.success(TASK_MESSAGES.STATUS_TOGGLE_SUCCESS(newStatus === 'active'));
    } catch (err) {
      // 自动回滚会在 onError 中发生，这里只需显示错误信息
      console.error('[Tasks] Failed to toggle task status:', { taskId: task.id, newStatus, error: err });
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(TASK_MESSAGES.STATUS_TOGGLE_ERROR, {
        description: message.length > 100 ? TASK_MESSAGES.RETRY_ERROR : message,
      });
    }
  }, [updateStatusMutation]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const taskName = deleteTarget.name;
    try {
      // 乐观更新会在 onMutate 中自动发生，任务立即从列表中消失
      await deleteTaskMutation.mutateAsync(deleteTarget.id);
      // 只在服务器确认后显示成功提示并关闭对话框
      toast.success(TASK_MESSAGES.DELETE_SUCCESS(taskName));
      setDeleteTarget(null);
    } catch (err) {
      // 自动回滚会在 onError 中发生，任务会重新出现在列表中
      console.error('[Tasks] Failed to delete task:', { taskId: deleteTarget.id, error: err });
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(TASK_MESSAGES.DELETE_ERROR, {
        description: message.length > 100 ? TASK_MESSAGES.RETRY_ERROR : message,
      });
      // 保持对话框打开，让用户可以重试
    }
  }, [deleteTarget, deleteTaskMutation]);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setFormOpen(true);
  }, []);

  const handleOpenDeleteDialog = useCallback((task: Task) => {
    setDeleteTarget(task);
  }, []);

  const handleOpenStatsDialog = useCallback((task: Task) => {
    setStatsTarget(task);
  }, []);

  const clearFilters = useCallback(() => {
    setKeyword('');
    setDebouncedKeyword('');
    setStatusFilter('');
    setTriggerFilter('');
    setTagFilter('');
    setPage(1);
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (tagFilter === 'has_cases' && parseCaseCount(task) === 0) return false;
      if (tagFilter === 'scheduled' && task.trigger_type !== 'scheduled') return false;
      if (tagFilter === 'failed' && task.recentExecutions?.[0]?.status !== 'failed') return false;
      if (tagFilter === 'healthy') {
        const successRate = getTaskSuccessRate(task);
        if (successRate == null || successRate < SUCCESS_RATE_THRESHOLDS.HIGH) return false;
      }
      return true;
    });
  }, [tasks, tagFilter]);

  const sortedTasks = useMemo(() => {
    const list = [...filteredTasks];
    const direction = sortDirection === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return direction * a.name.localeCompare(b.name, 'zh-CN');
        case 'status':
          return direction * getTaskSemanticStatus(a).label.localeCompare(getTaskSemanticStatus(b).label, 'zh-CN');
        case 'trigger':
          return direction * (TRIGGER_TYPE_LABELS[a.trigger_type] ?? a.trigger_type).localeCompare(
            TRIGGER_TYPE_LABELS[b.trigger_type] ?? b.trigger_type,
            'zh-CN'
          );
        case 'owner':
          return direction * (a.created_by_name ?? '').localeCompare(b.created_by_name ?? '', 'zh-CN');
        case 'successRate':
          return direction * ((getTaskSuccessRate(a) ?? -1) - (getTaskSuccessRate(b) ?? -1));
        case 'latestRun':
        default: {
          const aTime = a.recentExecutions?.[0]?.start_time ?? a.updated_at ?? '';
          const bTime = b.recentExecutions?.[0]?.start_time ?? b.updated_at ?? '';
          return direction * (new Date(aTime).getTime() - new Date(bTime).getTime());
        }
      }
    });

    return list;
  }, [filteredTasks, sortDirection, sortKey]);

  const hasActiveFilters = Boolean(keyword || statusFilter || triggerFilter || tagFilter);

  // ── 批量操作辅助函数 ──────────────────────────────────────
  const handleSelectTask = useCallback((taskId: number, checked: CheckedState) => {
    const shouldSelect = isCheckedState(checked);
    setSelectedTasks((prev) => {
      const newSet = new Set(prev);
      if (shouldSelect) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: CheckedState) => {
    if (isCheckedState(checked)) {
      setSelectedTasks(new Set(sortedTasks.map((t) => t.id)));
    } else {
      setSelectedTasks(new Set());
    }
  }, [sortedTasks]);

  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
    setIsBatchMode(false);
  }, []);

  // 计算选择状态
  const selectedCount = selectedTasks.size;
  const isAllSelected = sortedTasks.length > 0 && selectedCount === sortedTasks.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < sortedTasks.length;
  const selectAllState: CheckedState = isAllSelected
    ? true
    : isPartiallySelected
      ? 'indeterminate'
      : false;
  const selectedTasksList = sortedTasks.filter((t) => selectedTasks.has(t.id));

  const failedAlerts = useMemo(() =>
    tasks.filter((task) => task.recentExecutions?.[0]?.status === 'failed').length,
  [tasks]);

  // 批量操作处理函数
  const handleBatchPause = useCallback(() => {
    if (selectedCount === 0) return;
    setBatchDialog({ open: true, action: 'pause' });
  }, [selectedCount]);

  const handleBatchDelete = useCallback(() => {
    if (selectedCount === 0) return;
    setBatchDialog({ open: true, action: 'delete' });
  }, [selectedCount]);

  const handleBatchRun = useCallback(() => {
    if (selectedCount === 0) return;
    setBatchDialog({ open: true, action: 'run' });
  }, [selectedCount]);

  const handleBatchConfirm = useCallback(async () => {
    if (!batchDialog) {
      return { successes: 0, failures: 0 };
    }

    const taskIds = Array.from(selectedTasks);

    try {
      let result: BatchOperationResult;
      switch (batchDialog.action) {
        case 'activate':
          result = await batchUpdateStatusMutation.mutateAsync({
            taskIds,
            status: 'active',
          });
          toast.success(`成功启用 ${result.successes} 个任务`);
          break;

        case 'pause':
          result = await batchUpdateStatusMutation.mutateAsync({
            taskIds,
            status: 'paused',
          });
          toast.success(`成功暂停 ${result.successes} 个任务`);
          break;

        case 'delete':
          result = await batchDeleteMutation.mutateAsync(taskIds);
          toast.success(`成功删除 ${result.successes} 个任务`);
          break;

        case 'run':
          result = await batchRunMutation.mutateAsync(taskIds);
          toast.success(`成功运行 ${result.successes} 个任务`);
          break;
      }

      if (result.failures > 0) {
        const failedIds = result.failedTaskIds ?? [];
        const previewFailedIds = failedIds.slice(0, 5).join(', ');
        const hasMore = failedIds.length > 5;
        const failureDescription = failedIds.length > 0
          ? `失败任务ID: ${previewFailedIds}${hasMore ? ' ...' : ''}`
          : '请重试或查看后端日志';

        toast.error(`${result.failures} 个任务操作失败`, {
          description: failureDescription,
        });
      }

      clearSelection();
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error, '批量操作失败'));
      return { successes: 0, failures: selectedCount };
    }
  }, [
    batchDialog,
    selectedTasks,
    selectedCount,
    batchUpdateStatusMutation,
    batchDeleteMutation,
    batchRunMutation,
    clearSelection,
  ]);

  const errorMessage = error ? getErrorMessage(error) : '';
  const isPermissionDenied = /403|forbidden|权限/.test(errorMessage.toLowerCase());

  // ── 渲染 ──────────────────────────────────────────
  return (
    <div className="space-y-8 p-6">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Boxes className="h-8 w-8 text-emerald-600" />
            {TASK_PAGE.TITLE}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {TASK_PAGE.SUBTITLE}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isBatchMode ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => {
              setIsBatchMode(!isBatchMode);
              if (isBatchMode) clearSelection();
            }}
          >
            <CheckSquare className="h-4 w-4" />
            {isBatchMode ? '退出批量' : '批量操作'}
          </Button>

          {isBatchMode && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
              <Checkbox checked={selectAllState} onCheckedChange={handleSelectAll} />
              <span className="text-sm text-slate-600 dark:text-slate-400">全选</span>
            </div>
          )}

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setSchedulerOpen(true)}
            title="查看调度器运行状态"
          >
            <Monitor className="h-4 w-4 text-blue-500" />
            调度器监控
          </Button>

          <>
            <Button
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid className="h-4 w-4" />
              卡片
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
              表格
            </Button>
          </>

          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              setEditingTask(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {TASK_MESSAGES.BTN_CREATE}
          </Button>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-2 z-30 rounded-xl border border-emerald-200 bg-emerald-50/95 p-3 shadow-sm backdrop-blur transition-all duration-300 animate-in fade-in-0 slide-in-from-top-1 dark:border-emerald-900/40 dark:bg-emerald-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">已选 {selectedCount} 个任务</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchRun}>
                <Play className="h-4 w-4" />
                运行
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchPause}>
                <Pause className="h-4 w-4" />
                暂停
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchDelete}>
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.success('导出任务列表成功')}>
                <Download className="h-4 w-4" />
                导出
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-100 dark:border-blue-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-600 dark:text-blue-400 font-medium">
              {TASK_PAGE.STATS_TOTAL}
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" aria-label={TASK_MESSAGES.LOADING_TASKS} /> : stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-100 dark:border-green-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-green-600 dark:text-green-400 font-medium">
              {TASK_PAGE.STATS_ACTIVE}
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" aria-label={TASK_MESSAGES.LOADING_TASKS} /> : stats.active}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-transparent border-purple-100 dark:border-purple-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-purple-600 dark:text-purple-400 font-medium">
              {TASK_PAGE.STATS_TODAY_RUNS}
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" aria-label={TASK_MESSAGES.LOADING_TASKS} /> : stats.todayRuns}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-transparent border-red-100 dark:border-red-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-red-600 dark:text-red-400 font-medium">
              失败告警
            </CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" aria-label={TASK_MESSAGES.LOADING_TASKS} /> : failedAlerts}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* 筛选栏 */}
      <div className="sticky top-16 z-20 space-y-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="搜索任务名称..."
              className="pl-9"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            快速刷新
          </Button>

          <Button variant="outline" size="sm" className="gap-1.5" onClick={saveCurrentFilter}>
            <Save className="h-4 w-4" />
            常用筛选
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-slate-500">
              <X className="h-4 w-4" />
              清空
            </Button>
          )}
        </div>

        <div className="space-y-2">
            <FilterGroup
              label="状态"
              compact
              options={TASK_STATUS_FILTER_OPTIONS.map((v) => ({ value: v, label: v === '' ? '全部状态' : STATUS_LABELS[v] }))}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as TaskStatusFilter);
                setPage(1);
              }}
            />
            <FilterGroup
              label="触发方式"
              compact
              options={TASK_TRIGGER_FILTER_OPTIONS.map((v) => ({ value: v, label: v === '' ? '全部触发' : TRIGGER_TYPE_LABELS[v] }))}
              value={triggerFilter}
              onChange={(v) => {
                setTriggerFilter(v as TaskTriggerFilter);
                setPage(1);
              }}
            />
            <FilterGroup
              label="标签"
              compact
              options={TASK_TAG_FILTER_OPTIONS}
              value={tagFilter}
              onChange={(v) => {
                setTagFilter(v as TaskTagFilter);
                setPage(1);
              }}
            />
        </div>

        {savedFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">常用:</span>
            {savedFilters.map((item) => (
              <div key={item.name} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 pl-2 pr-1 dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  className="py-1 text-slate-700 dark:text-slate-300"
                  onClick={() => applySavedFilter(item.name)}
                  aria-label={`应用筛选 ${item.name}`}
                  title={`应用筛选 ${item.name}`}
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  onClick={() => removeSavedFilter(item.name)}
                  aria-label={`删除筛选 ${item.name}`}
                  title={`删除筛选 ${item.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 加载 / 错误 / 任务列表 */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
          <p className="text-slate-500 animate-pulse">{TASK_MESSAGES.LOADING_TASKS}</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-4">
          <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20">
            {isPermissionDenied ? <ShieldAlert className="h-10 w-10 text-amber-500" /> : <AlertCircle className="h-10 w-10 text-red-500" />}
          </div>
          <p className="text-red-600 font-medium">
            {isPermissionDenied ? '暂无权限访问任务管理' : `${TASK_MESSAGES.LOAD_ERROR}: ${errorMessage}`}
          </p>
          {!isPermissionDenied && (
            <Button variant="outline" onClick={() => refetch()}>
              {TASK_MESSAGES.BTN_RETRY}
            </Button>
          )}
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-4 text-slate-400">
          <Boxes className="h-16 w-16 opacity-30" />
          <p className="text-lg">
            {hasActiveFilters ? TASK_MESSAGES.NO_TASKS_WITH_FILTER : TASK_MESSAGES.NO_TASKS_CREATE_NEW}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              {TASK_MESSAGES.BTN_CLEAR_FILTER}
            </Button>
          )}
        </div>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-4 gap-6">
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onRunTask={handleRunTask}
                  onEditTask={handleEditTask}
                  onToggleStatus={handleToggleStatus}
                  onDeleteTask={handleOpenDeleteDialog}
                  onStatsTask={handleOpenStatsDialog}
                  onCancelTask={handleCancelLatestExecution}
                  isRunning={runTaskMutation.isPending && runTaskMutation.variables === task.id}
                  isQueued={queueInfoByTaskId.get(task.id)?.isQueued ?? false}
                  queuePosition={queueInfoByTaskId.get(task.id)?.queuePosition}
                  isBatchMode={isBatchMode}
                  isSelected={selectedTasks.has(task.id)}
                  onSelectTask={handleSelectTask}
                />
              ))}
            </div>
          ) : (
            <TaskTableView
              tasks={sortedTasks}
              selectedTasks={selectedTasks}
              columnVisibility={columnVisibility}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={toggleSort}
              onSelectTask={handleSelectTask}
              onRunTask={handleRunTask}
              onToggleStatus={handleToggleStatus}
              onEditTask={handleEditTask}
              onDeleteTask={handleOpenDeleteDialog}
            />
          )}

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
                    const prev = arr[idx - 1];
                    // 类型安全：确保 prev 和 p 都是 number 类型
                    if (idx > 0 && typeof prev === 'number' && typeof p === 'number' && p - prev > 1) {
                      acc.push('...');
                    }
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
                        onClick={() => setPage(p)}
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
            <DialogTitle>{TASK_MESSAGES.DELETE_CONFIRM_TITLE}</DialogTitle>
            <DialogDescription>
              {TASK_MESSAGES.DELETE_CONFIRM_DESC}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-4 border border-red-100 dark:border-red-900/30 text-sm text-red-700 dark:text-red-400">
            {TASK_MESSAGES.DELETE_CONFIRM_TARGET(deleteTarget?.name || '')}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {TASK_MESSAGES.BTN_CANCEL}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteTaskMutation.isPending}
            >
              {deleteTaskMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {TASK_MESSAGES.BTN_DELETE}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 任务统计弹窗 */}
      {statsTarget && (
        <TaskStatsDialog
          task={statsTarget}
          onClose={() => setStatsTarget(null)}
        />
      )}

      {/* 调度器监控弹窗 */}
      {schedulerOpen && (
        <SchedulerMonitorDialog onClose={() => setSchedulerOpen(false)} />
      )}

      {/* 批量操作确认对话框 */}
      {batchDialog && (
        <BatchConfirmDialog
          open={batchDialog.open}
          onOpenChange={(open) => !open && setBatchDialog(null)}
          action={batchDialog.action}
          tasks={selectedTasksList}
          onConfirm={handleBatchConfirm}
        />
      )}

      {/* 保存常用筛选名称对话框 */}
      <Dialog open={filterNameDialogOpen} onOpenChange={setFilterNameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>保存常用筛选</DialogTitle>
            <DialogDescription>
              为当前筛选条件命名，方便下次快速复用
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="请输入筛选名称"
              value={filterNameInput}
              onChange={(e) => setFilterNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFilterConfirm()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFilterNameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveFilterConfirm} disabled={!filterNameInput.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
