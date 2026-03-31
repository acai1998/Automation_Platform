import { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Boxes,
  Play,
  Pause,
  AlertCircle,
  Loader2,
  MoreVertical,
  Calendar,
  BarChart3,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileText,
  RefreshCw,
  X,
  TrendingUp,
  XCircle,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  ListOrdered,
  User,
  Monitor,
  CheckSquare,
  ListChecks,
  ChevronDown,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Save,
  Download,
  ShieldAlert,
  ArrowUpDown,
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
  useCancelExecution,
  useTaskStats,
  useTaskAuditLogs,
  useSchedulerStatus,
  useBatchUpdateTaskStatus,
  useBatchDeleteTask,
  useBatchRunTask,
  useCronPreview,
  type Task,
  type TaskExecution,
  type CreateTaskInput,
  type TaskListParams,
  type BatchOperationResult,
} from '@/hooks/useTasks';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { BatchConfirmDialog } from '@/components/tasks/BatchConfirmDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAllCasesForSelect, type TestCase as CaseItem, type CaseType } from '@/hooks/useCases';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  TASKS_CONFIG,
  TRIGGER_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  EXECUTION_STATUS_CONFIG,
  SUCCESS_RATE_THRESHOLDS,
} from '@/constants/tasks';
import { TASK_MESSAGES, TASK_PAGE } from '@/constants/messages';

type TaskTriggerType = 'manual' | 'scheduled' | 'ci_triggered';
type TaskStatusFilter = '' | 'active' | 'paused' | 'archived';
type TaskTriggerFilter = '' | TaskTriggerType;

const TASK_STATUS_FILTER_OPTIONS: readonly TaskStatusFilter[] = [
  '',
  'active',
  'paused',
  'archived',
];

const TASK_TRIGGER_FILTER_OPTIONS: readonly TaskTriggerFilter[] = [
  '',
  'manual',
  'scheduled',
  'ci_triggered',
];

const TASK_TRIGGER_TYPE_OPTIONS: ReadonlyArray<{ value: TaskTriggerType; label: string }> = [
  { value: 'manual', label: '手动触发' },
  { value: 'scheduled', label: '定时触发' },
  { value: 'ci_triggered', label: 'CI 触发' },
];

const CASE_TYPE_FILTER_OPTIONS: ReadonlyArray<{ value: CaseType | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'api', label: 'API' },
  { value: 'ui', label: 'UI' },
  { value: 'performance', label: '性能' },
];

const AUDIT_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: '创建任务', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  updated: { label: '更新任务', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  deleted: { label: '删除任务', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  status_changed: { label: '状态变更', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  manually_triggered: { label: '手动触发', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  execution_cancelled: { label: '取消执行', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  compensated: { label: '漏触补偿', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  triggered: { label: '调度触发', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  retry_scheduled: { label: '重试排队', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  permanently_failed: { label: '彻底失败', color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
};

type TaskViewMode = 'cards' | 'table';
type TaskTagFilter = '' | 'has_cases' | 'scheduled' | 'failed' | 'healthy';
type TaskSortKey = 'name' | 'status' | 'trigger' | 'owner' | 'latestRun' | 'successRate';
type SortDirection = 'asc' | 'desc';

const TASK_FILTER_PRESET_KEY = 'task-management.common-filters';

const TASK_TAG_FILTER_OPTIONS: ReadonlyArray<{ value: TaskTagFilter; label: string }> = [
  { value: '', label: '全部标签' },
  { value: 'has_cases', label: '已关联用例' },
  { value: 'scheduled', label: '定时任务' },
  { value: 'failed', label: '失败预警' },
  { value: 'healthy', label: '稳定任务' },
];

const TABLE_COLUMN_OPTIONS: ReadonlyArray<{ key: TaskSortKey; label: string }> = [
  { key: 'name', label: '任务名' },
  { key: 'status', label: '状态' },
  { key: 'trigger', label: '触发方式' },
  { key: 'owner', label: '负责人' },
  { key: 'latestRun', label: '最近运行' },
  { key: 'successRate', label: '成功率' },
];

const TASK_STATUS_SEMANTIC = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
} as const;

type TaskSemanticStatus = keyof typeof TASK_STATUS_SEMANTIC;

const isCheckedState = (checked: CheckedState): boolean => checked === true;

const getErrorMessage = (error: unknown, fallback: string = TASK_MESSAGES.GENERIC_ERROR): string =>
  error instanceof Error ? error.message : fallback;

const parseCaseCount = (task: Task): number => {
  if (!task.case_ids) return 0;
  try {
    const ids = JSON.parse(task.case_ids);
    return Array.isArray(ids) ? ids.length : 0;
  } catch {
    return 0;
  }
};

const getTaskSuccessRate = (task: Task): number | null => {
  const latest = task.recentExecutions?.[0];
  if (!latest?.total_cases) return null;
  return Math.round((latest.passed_cases / latest.total_cases) * 100);
};

const getTaskSemanticStatus = (task: Task): { key: TaskSemanticStatus; label: string } => {
  if (task.status === 'archived') return { key: 'draft', label: '草稿' };

  const latest = task.recentExecutions?.[0];
  if (latest?.status === 'running' || latest?.status === 'pending') {
    return { key: 'running', label: '运行中' };
  }
  if (task.status === 'paused') return { key: 'paused', label: '暂停' };
  if (latest?.status === 'failed') return { key: 'failed', label: '失败' };
  return { key: 'success', label: '成功' };
};

const formatTime = (value?: string): string => {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/* ─── 主页面 ─────────────────────────────────────────── */

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
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === 'undefined' ? 1440 : window.innerWidth);
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
  const columnVisibility: Record<TaskSortKey, boolean> = {
    name: true,
    status: true,
    trigger: true,
    owner: true,
    latestRun: true,
    successRate: true,
  };

  const isWideDesktop = viewportWidth >= 1440;
  const isFilterPopoverMode = viewportWidth >= 1024 && viewportWidth < 1440;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
  const isMobile = viewportWidth < 768;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (viewportWidth < 1024) {
      setViewMode('cards');
    }
  }, [viewportWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(TASK_FILTER_PRESET_KEY, JSON.stringify(savedFilters));
    } catch {
      // ignore storage failure
    }
  }, [savedFilters]);

  const saveCurrentFilter = useCallback(() => {
    const name = window.prompt('请输入常用筛选名称');
    if (!name?.trim()) return;

    const preset = {
      name: name.trim(),
      keyword,
      statusFilter,
      triggerFilter,
      tagFilter,
    };

    setSavedFilters((prev) => {
      const withoutDuplicate = prev.filter((item) => item.name !== preset.name);
      return [preset, ...withoutDuplicate].slice(0, 6);
    });
    toast.success(`已保存常用筛选：${preset.name}`);
  }, [keyword, statusFilter, triggerFilter, tagFilter]);

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
        const previewFailedIds = result.failedTaskIds.slice(0, 5).join(', ');
        const hasMore = result.failedTaskIds.length > 5;
        const failureDescription = result.failedTaskIds.length > 0
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
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

          {!isMobile && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setSchedulerOpen(true)}
              title="查看调度器运行状态"
            >
              <Monitor className="h-4 w-4 text-blue-500" />
              调度器监控
            </Button>
          )}

          {!isMobile && (
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
                disabled={isTablet}
              >
                <List className="h-4 w-4" />
                表格
              </Button>
            </>
          )}

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
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
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

        {isFilterPopoverMode ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                筛选条件
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[420px] p-4">
              <div className="space-y-3">
                <FilterGroup
                  label="状态"
                  options={TASK_STATUS_FILTER_OPTIONS.map((v) => ({ value: v, label: v === '' ? '全部状态' : STATUS_LABELS[v] }))}
                  value={statusFilter}
                  onChange={(v) => {
                    setStatusFilter(v as TaskStatusFilter);
                    setPage(1);
                  }}
                />
                <FilterGroup
                  label="触发方式"
                  options={TASK_TRIGGER_FILTER_OPTIONS.map((v) => ({ value: v, label: v === '' ? '全部触发' : TRIGGER_TYPE_LABELS[v] }))}
                  value={triggerFilter}
                  onChange={(v) => {
                    setTriggerFilter(v as TaskTriggerFilter);
                    setPage(1);
                  }}
                />
                <FilterGroup
                  label="标签"
                  options={TASK_TAG_FILTER_OPTIONS}
                  value={tagFilter}
                  onChange={(v) => {
                    setTagFilter(v as TaskTagFilter);
                    setPage(1);
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        ) : (
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
        )}

        {savedFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">常用:</span>
            {savedFilters.map((item) => (
              <div key={item.name} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 pl-2 pr-1 dark:border-slate-700 dark:bg-slate-800">
                <button className="py-1 text-slate-700 dark:text-slate-300" onClick={() => applySavedFilter(item.name)}>
                  {item.name}
                </button>
                <button className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => removeSavedFilter(item.name)}>
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
            <div className={cn(
              'grid gap-6',
              isWideDesktop ? '2xl:grid-cols-4 xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2' : 'xl:grid-cols-2 md:grid-cols-2',
              (isTablet || isMobile) && 'grid-cols-1'
            )}>
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
    </div>
  );
}

interface FilterGroupProps {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

function FilterGroup({ label, options, value, onChange, compact = false }: FilterGroupProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', compact && 'gap-1.5')}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {options.map((option) => (
        <Button
          key={option.value || 'all'}
          type="button"
          size="sm"
          variant={value === option.value ? 'default' : 'outline'}
          className={cn('h-8', compact && 'h-7 px-2 text-xs')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

interface TaskTableViewProps {
  tasks: Task[];
  selectedTasks: Set<number>;
  columnVisibility: Record<TaskSortKey, boolean>;
  sortKey: TaskSortKey;
  sortDirection: SortDirection;
  onSort: (key: TaskSortKey) => void;
  onSelectTask: (taskId: number, checked: CheckedState) => void;
  onRunTask: (taskId: number, taskName: string) => void;
  onToggleStatus: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

function TaskTableView({
  tasks,
  selectedTasks,
  columnVisibility,
  sortKey,
  sortDirection,
  onSort,
  onSelectTask,
  onRunTask,
  onToggleStatus,
  onEditTask,
  onDeleteTask,
}: TaskTableViewProps) {
  const visibleColumns = TABLE_COLUMN_OPTIONS.filter((column) => columnVisibility[column.key]);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/80">
          <tr>
            <th className="w-10 px-3 py-3 text-left">
              <span className="sr-only">选择</span>
            </th>
            {visibleColumns.map((column) => (
              <th key={column.key} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <button className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => onSort(column.key)}>
                  {column.label}
                  {sortKey === column.key && <ArrowUpDown className={cn('h-3.5 w-3.5', sortDirection === 'desc' && 'rotate-180')} />}
                </button>
              </th>
            ))}
            <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const status = getTaskSemanticStatus(task);
            const latest = task.recentExecutions?.[0];
            const successRate = getTaskSuccessRate(task);
            return (
              <tr key={task.id} className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40">
                <td className="px-3 py-3">
                  <Checkbox checked={selectedTasks.has(task.id)} onCheckedChange={(checked) => onSelectTask(task.id, checked)} />
                </td>
                {columnVisibility.name && <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100">{task.name}</td>}
                {columnVisibility.status && (
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', TASK_STATUS_SEMANTIC[status.key])}>{status.label}</span>
                  </td>
                )}
                {columnVisibility.trigger && <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{TRIGGER_TYPE_LABELS[task.trigger_type] ?? task.trigger_type}</td>}
                {columnVisibility.owner && <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{task.created_by_name ?? '-'}</td>}
                {columnVisibility.latestRun && <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{formatTime(latest?.start_time)}</td>}
                {columnVisibility.successRate && <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-200">{successRate == null ? '-' : `${successRate}%`}</td>}
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRunTask(task.id, task.name)}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleStatus(task)}>
                      <Pause className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditTask(task)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteTask(task)}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 任务卡片 ─────────────────────────────────────────── */

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

const TaskCard = memo(function TaskCard({
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
      <CardHeader className="pb-3 sm:pb-4">
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
            <CardTitle className="text-base sm:text-xl font-bold group-hover:text-blue-600 transition-colors truncate">
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

      <CardContent className="flex-1 space-y-3 sm:space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1 sm:line-clamp-2 min-h-[1.5rem] sm:min-h-[2.5rem]">
          {task.description || TASK_MESSAGES.NO_DESCRIPTION}
        </p>

        {/* 触发类型 & 成功率 */}
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
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

      <CardFooter className="pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
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

/* ─── 任务统计弹窗 ─────────────────────────────────────────── */

type StatsTab = 'stats' | 'audit';

function TaskStatsDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<StatsTab>('stats');
  const { data: stats, isLoading: statsLoading, error: statsError } = useTaskStats(task.id, 30);
  const { data: auditData, isLoading: auditLoading } = useTaskAuditLogs(task.id, 50, 0);

  const successRateColor = (rate: number) =>
    rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-orange-500' : 'text-red-500';

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 animate-in fade-in-0 zoom-in-95 duration-200">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-blue-500" />
            {task.name}
          </DialogTitle>
          <DialogDescription>
            执行统计与操作审计
          </DialogDescription>
        </DialogHeader>

        {/* 标签页切换 */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 px-4">
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
            onClick={() => setActiveTab('stats')}
          >
            <TrendingUp className="h-4 w-4" />
            执行统计（近30天）
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
            onClick={() => setActiveTab('audit')}
          >
            <ListOrdered className="h-4 w-4" />
            操作审计
            {auditData && auditData.total > 0 && (
              <span className="ml-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full">
                {auditData.total}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ─── 执行统计标签页 ─── */}
          {activeTab === 'stats' && (
            <div className="">
              {statsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : statsError ? (
                <div className="flex items-center gap-2 text-red-600 py-4">
                  <AlertCircle className="h-5 w-5" />
                  <span>加载失败：{getErrorMessage(statsError)}</span>
                </div>
              ) : stats ? (
                <div className="space-y-6">
                  {/* 摘要卡片 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-center">
                      <p className="text-2xl font-bold">{stats.summary.total}</p>
                      <p className="text-xs text-slate-500 mt-1">总执行次数</p>
                    </div>
                    <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 text-center">
                      <p className={`text-2xl font-bold ${successRateColor(stats.summary.successRate)}`}>
                        {stats.summary.successRate}%
                      </p>
                      <p className="text-xs text-slate-500 mt-1">成功率</p>
                    </div>
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{stats.summary.failedCount}</p>
                      <p className="text-xs text-slate-500 mt-1">失败次数</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {stats.summary.avgDurationSec > 0 ? `${stats.summary.avgDurationSec}s` : '-'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">平均耗时</p>
                    </div>
                  </div>

                  {/* 每日成功率趋势 */}
                  {stats.trend.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                        每日成功率趋势
                      </h4>
                      <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                        {stats.trend.map((item) => (
                          <div key={item.day} className="flex items-center gap-3 text-sm">
                            <span className="w-24 shrink-0 text-slate-500 text-xs">{item.day}</span>
                            <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  item.successRate >= 80
                                    ? 'bg-green-500'
                                    : item.successRate >= 50
                                    ? 'bg-orange-400'
                                    : 'bg-red-400'
                                )}
                                style={{ width: `${Math.max(2, item.successRate)}%` }}
                              />
                            </div>
                            <span className={cn('w-10 text-right font-bold text-xs shrink-0', successRateColor(item.successRate))}>
                              {item.successRate}%
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{item.total}次</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top 10 失败原因 */}
                  {stats.topErrors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        高频失败原因 TOP 10
                      </h4>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                        {stats.topErrors.map((err, idx) => (
                          <div key={idx} className="flex items-start gap-3 text-xs rounded-lg p-2 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                            <span className="font-bold text-red-500 shrink-0 w-4">{idx + 1}</span>
                            <span className="flex-1 text-slate-700 dark:text-slate-300 break-all line-clamp-2">
                              {err.errorMessage}
                            </span>
                            <Badge variant="secondary" className="shrink-0 text-xs bg-red-100 dark:bg-red-900/30 text-red-600">
                              {err.count}次
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats.trend.length === 0 && stats.topErrors.length === 0 && (
                    <div className="text-center py-6 text-slate-400">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>近 30 天内暂无运行记录</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* ─── 审计日志标签页 ─── */}
          {activeTab === 'audit' && (
            <div className="">
              {auditLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : !auditData || auditData.data.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <ListOrdered className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>暂无操作记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">
                    共 {auditData.total} 条操作记录（显示最近 50 条）
                  </p>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {auditData.data.map((entry) => {
                      const actionConfig = AUDIT_ACTION_LABELS[entry.action] ?? {
                        label: entry.action,
                        color: 'bg-slate-100 text-slate-600',
                      };
                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* 操作类型标签 */}
                          <span className={cn(
                            'shrink-0 text-xs px-2 py-1 rounded-full font-medium',
                            actionConfig.color
                          )}>
                            {actionConfig.label}
                          </span>

                          {/* 元数据摘要 */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                              {JSON.stringify(entry.metadata) === '{}' ? '（无附加信息）' : (
                                Object.entries(entry.metadata)
                                  .slice(0, 3)
                                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                                  .join(' · ')
                              )}
                            </p>
                          </div>

                          {/* 操作者 + 时间 */}
                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                              <User className="h-3 w-3" />
                              {entry.operatorName ?? (entry.operatorId != null ? `#${entry.operatorId}` : '系统')}
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                              <Clock className="h-3 w-3" />
                              {entry.createdAt
                                ? new Date(entry.createdAt).toLocaleString('zh-CN', {
                                    month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit',
                                  })
                                : '-'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-6 py-3 bg-slate-50/80 dark:bg-slate-900/60">
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 调度器监控弹窗 ───────────────────────────────────────── */

function SchedulerMonitorDialog({ onClose }: { onClose: () => void }) {
  const { data: status, isLoading, error, refetch } = useSchedulerStatus();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            调度器实时状态
          </DialogTitle>
          <DialogDescription>
            每 10 秒自动刷新 · 显示运行中、排队及已计划任务
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 max-h-[68vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 py-4">
            <AlertCircle className="h-5 w-5" />
            <span>加载失败：{getErrorMessage(error)}</span>
          </div>
        ) : status ? (
          <div className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            {/* 并发状态概览 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{status.running.length}</p>
                <p className="text-xs text-slate-500 mt-1">运行中</p>
                <p className="text-xs text-blue-400 mt-0.5">上限 {status.concurrencyLimit}</p>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {(status.queueDepth ?? status.queued.length) + (status.directQueueDepth ?? status.directQueued.length)}
                </p>
                <p className="text-xs text-slate-500 mt-1">等待队列</p>
                {status.maxQueueDepth && (
                  <p className="text-xs text-amber-400 mt-0.5">上限 {status.maxQueueDepth}</p>
                )}
              </div>
              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{status.scheduled.length}</p>
                <p className="text-xs text-slate-500 mt-1">已计划</p>
              </div>
            </div>

            {/* 并发使用率进度条 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>并发使用率</span>
                <span>{status.running.length} / {status.concurrencyLimit}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    status.running.length >= status.concurrencyLimit
                      ? 'bg-red-500'
                      : status.running.length >= status.concurrencyLimit * 0.7
                      ? 'bg-amber-400'
                      : 'bg-blue-500'
                  )}
                  style={{
                    width: `${Math.min(100, (status.running.length / Math.max(1, status.concurrencyLimit)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* 运行中的任务（P1：显示 taskId + runId + 已运行时长） */}
            {status.running.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
                  运行中 ({status.running.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {status.running.map((slot) => {
                    const elapsedSec = Math.round((slot.elapsedMs ?? 0) / 1000);
                    const elapsedDisplay = elapsedSec >= 60
                      ? `${Math.floor(elapsedSec / 60)}m${elapsedSec % 60}s`
                      : `${elapsedSec}s`;
                    return (
                      <div key={slot.runId ?? slot.taskId} className="flex items-center justify-between px-2 py-1 rounded-md text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono">
                        <span>Task #{slot.taskId}</span>
                        <span className="text-blue-400 ml-2">Run #{slot.runId}</span>
                        <span className="text-blue-500 ml-auto">{elapsedDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 等待队列（P1：显示优先级、等待时长、触发方式） */}
            {status.queued.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  等待队列 ({status.queued.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {status.queued.map((item) => {
                    const waitSec = Math.round((item.waitMs ?? 0) / 1000);
                    const waitDisplay = waitSec >= 60
                      ? `${Math.floor(waitSec / 60)}m${waitSec % 60}s`
                      : `${waitSec}s`;
                    const triggerLabel = item.triggerReason === 'manual' ? '手动' : item.triggerReason === 'retry' ? '重试' : '定时';
                    return (
                      <div key={`${item.taskId}-${item.queuePosition}`} className="flex items-center gap-2 px-2 py-1 rounded-md text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-mono">
                        <span className="text-amber-400 font-bold w-5">#{item.queuePosition}</span>
                        <span>Task #{item.taskId}</span>
                        <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-800/30 text-amber-600">{triggerLabel}</span>
                        <span className="ml-auto text-amber-400">等待 {waitDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 直连等待队列（run-case / run-batch） */}
            {status.directQueued.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                  直连等待队列 ({status.directQueued.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {status.directQueued.map((item) => {
                    const waitSec = Math.round((item.waitMs ?? 0) / 1000);
                    const waitDisplay = waitSec >= 60
                      ? `${Math.floor(waitSec / 60)}m${waitSec % 60}s`
                      : `${waitSec}s`;
                    return (
                      <div key={`${item.label}-${item.queuePosition}`} className="flex items-center gap-2 px-2 py-1 rounded-md text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-mono">
                        <span className="text-violet-400 font-bold w-5">#{item.queuePosition}</span>
                        <span className="truncate">{item.label}</span>
                        <span className="ml-auto text-violet-400">等待 {waitDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 已计划的任务 */}
            {status.scheduled.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  已计划定时触发 ({status.scheduled.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {status.scheduled.map((id) => (
                    <span key={id} className="px-2 py-1 rounded-md text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-mono">
                      Task #{id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {status.running.length === 0 && status.queued.length === 0 && status.directQueued.length === 0 && (
              <div className="text-center py-4 text-slate-400">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">调度器空闲，无任务运行</p>
              </div>
            )}
          </div>
        ) : null}
        </div>

        <DialogFooter className="gap-2 px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/** 用例类型标签映射 */
const CASE_TYPE_LABELS: Record<string, string> = {
  api: 'API',
  ui: 'UI',
  performance: '性能',
};

/** 用例类型颜色 */
const CASE_TYPE_COLORS: Record<string, string> = {
  api: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ui: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  performance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

/** Cron 常用预设 */
const CRON_PRESETS = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天凌晨', value: '0 2 * * *' },
  { label: '工作日9点', value: '0 9 * * 1-5' },
  { label: '每周一', value: '0 9 * * 1' },
  { label: '每月1号', value: '0 9 1 * *' },
] as const;

function TaskFormDialog({ open, task, onClose, onSave, isSaving }: TaskFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TaskTriggerType>('manual');
  const [cronExpression, setCronExpression] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Cron 预览（防抖后才触发查询）──────────────────────────────────
  const [debouncedCron, setDebouncedCron] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCron(cronExpression), 600);
    return () => clearTimeout(t);
  }, [cronExpression]);

  const cronPreviewExpr = triggerType === 'scheduled' ? debouncedCron : '';
  const {
    data: cronPreviewData,
    isFetching: cronPreviewLoading,
  } = useCronPreview(cronPreviewExpr, 5);

  // ── 关联用例状态 ──────────────────────────────────────
  const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseTypeFilter, setCaseTypeFilter] = useState<CaseType | ''>('');
  const [casePickerOpen, setCasePickerOpen] = useState(false);

  // 已选用例对象缓存（独立维护，避免 API 加载中时标签短暂消失）
  const [selectedCaseObjects, setSelectedCaseObjects] = useState<CaseItem[]>([]);

  // 搜索防抖
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(caseSearch), 300);
    return () => clearTimeout(t);
  }, [caseSearch]);

  const { data: casesData, isLoading: casesLoading } = useAllCasesForSelect({
    search: debouncedSearch,
    type: caseTypeFilter,
    enabled: open, // 弹窗打开时才请求
  });
  const allCases = casesData?.data ?? [];

  // 同步已选用例对象缓存（避免在事件回调内嵌套 setState）
  useEffect(() => {
    if (selectedCaseIds.length === 0) {
      setSelectedCaseObjects([]);
      return;
    }

    setSelectedCaseObjects((prev) => {
      const cacheById = new Map<number, CaseItem>();
      prev.forEach((item) => cacheById.set(item.id, item));
      allCases.forEach((item) => cacheById.set(item.id, item));

      return selectedCaseIds
        .map((id) => cacheById.get(id))
        .filter((item): item is CaseItem => item !== undefined);
    });
  }, [allCases, selectedCaseIds]);

  // 候选列表（排除已选）
  const candidateCases = useMemo(
    () => allCases.filter((c) => !selectedCaseIds.includes(c.id)),
    [allCases, selectedCaseIds]
  );

  // 已选用例对象：按 selectedCaseIds 顺序展示，保证顺序稳定
  const selectedCases = selectedCaseObjects;

  // 回填编辑数据
  useEffect(() => {
    if (open) {
      setName(task?.name ?? '');
      setDescription(task?.description ?? '');
      setTriggerType(task?.trigger_type ?? 'manual');
      setCronExpression(task?.cron_expression ?? '');
      setErrors({});
      setCaseSearch('');
      setCaseTypeFilter('');
      setCasePickerOpen(false);
      setSelectedCaseObjects([]);
      // 回填已有 case_ids
      if (task?.case_ids) {
        try {
          const ids = JSON.parse(task.case_ids);
          setSelectedCaseIds(Array.isArray(ids) ? ids : []);
        } catch {
          setSelectedCaseIds([]);
        }
      } else {
        setSelectedCaseIds([]);
      }
    }
  }, [open, task]);

  const toggleCaseSelect = useCallback((caseId: number) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId)
        ? prev.filter((id) => id !== caseId)
        : [...prev, caseId]
    );
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};

    // 任务名称验证
    if (!name.trim()) {
      errs.name = TASK_MESSAGES.NAME_REQUIRED;
    } else if (name.trim().length > TASKS_CONFIG.MAX_NAME_LENGTH) {
      errs.name = TASK_MESSAGES.NAME_TOO_LONG;
    } else if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]+$/.test(name.trim())) {
      errs.name = TASK_MESSAGES.NAME_INVALID_CHARS;
    }

    // 描述验证
    if (description.trim().length > TASKS_CONFIG.MAX_DESCRIPTION_LENGTH) {
      errs.description = TASK_MESSAGES.DESCRIPTION_TOO_LONG;
    }

    // Cron 表达式验证
    if (triggerType === 'scheduled') {
      if (!cronExpression.trim()) {
        errs.cronExpression = TASK_MESSAGES.CRON_REQUIRED;
      } else {
        const parts = cronExpression.trim().split(/\s+/);
        if (parts.length !== TASKS_CONFIG.CRON_SEGMENTS) {
          errs.cronExpression = TASK_MESSAGES.CRON_INVALID_FORMAT;
        } else {
          // 验证每段的合法性（简单验证：数字、*、逗号、连字符、斜杠）
          const isValid = parts.every((part) => /^[\d\*\-,\/]+$/.test(part));
          if (!isValid) {
            errs.cronExpression = TASK_MESSAGES.CRON_INVALID_CHARS;
          }
        }
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
      caseIds: selectedCaseIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 animate-in fade-in-0 zoom-in-95 duration-200">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle>{task ? TASK_MESSAGES.FORM_EDIT_TITLE : TASK_MESSAGES.FORM_CREATE_TITLE}</DialogTitle>
          <DialogDescription>
            {task ? TASK_MESSAGES.FORM_EDIT_DESC : TASK_MESSAGES.FORM_CREATE_DESC}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-4">
          {/* 任务名称 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {TASK_MESSAGES.FORM_NAME_LABEL} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder={TASK_MESSAGES.FORM_NAME_PLACEHOLDER}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: '' }));
              }}
              className={cn(errors.name && 'border-red-400 focus-visible:ring-red-400')}
              aria-label={TASK_MESSAGES.FORM_NAME_LABEL}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && <p id="name-error" className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* 任务描述 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {TASK_MESSAGES.FORM_DESCRIPTION_LABEL}
            </label>
            <Textarea
              placeholder={TASK_MESSAGES.FORM_DESCRIPTION_PLACEHOLDER}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors((p) => ({ ...p, description: '' }));
              }}
              rows={3}
              className={cn(errors.description && 'border-red-400 focus-visible:ring-red-400')}
              aria-label={TASK_MESSAGES.FORM_DESCRIPTION_LABEL}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && <p id="description-error" className="text-xs text-red-500">{errors.description}</p>}
          </div>

          {/* 触发类型 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {TASK_MESSAGES.FORM_TRIGGER_LABEL}
            </label>
            <div className="flex gap-2" role="group" aria-label={TASK_MESSAGES.FORM_TRIGGER_LABEL}>
              {TASK_TRIGGER_TYPE_OPTIONS.map(({ value, label }) => (
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
                  role="radio"
                  aria-checked={triggerType === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cron 表达式（仅定时触发时显示） */}
          {triggerType === 'scheduled' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {TASK_MESSAGES.FORM_CRON_LABEL} <span className="text-red-500">*</span>
              </label>

              {/* 常用预设快捷按钮 */}
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setCronExpression(preset.value);
                      if (errors.cronExpression) setErrors((p) => ({ ...p, cronExpression: '' }));
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                      cronExpression === preset.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                        : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Cron 输入框 */}
              <Input
                placeholder={TASK_MESSAGES.FORM_CRON_PLACEHOLDER}
                value={cronExpression}
                onChange={(e) => {
                  setCronExpression(e.target.value);
                  if (errors.cronExpression) setErrors((p) => ({ ...p, cronExpression: '' }));
                }}
                className={cn(
                  'font-mono',
                  errors.cronExpression && 'border-red-400 focus-visible:ring-red-400'
                )}
                aria-label={TASK_MESSAGES.FORM_CRON_LABEL}
                aria-invalid={!!errors.cronExpression}
                aria-describedby={errors.cronExpression ? 'cron-error' : 'cron-hint'}
              />
              {errors.cronExpression ? (
                <p id="cron-error" className="text-xs text-red-500">{errors.cronExpression}</p>
              ) : (
                <p id="cron-hint" className="text-xs text-slate-400">{TASK_MESSAGES.FORM_CRON_HINT}</p>
              )}

              {/* 下次运行时间预览卡片 */}
              {(cronPreviewLoading || (cronPreviewData?.times && cronPreviewData.times.length > 0)) && (
                <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/10 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>未来运行时间预览</span>
                    {cronPreviewLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </div>
                  {!cronPreviewLoading && cronPreviewData?.times.map((isoTime, idx) => {
                    const d = new Date(isoTime);
                    const dateStr = d.toLocaleDateString('zh-CN', {
                      month: '2-digit', day: '2-digit', weekday: 'short',
                    });
                    const timeStr = d.toLocaleTimeString('zh-CN', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <div
                        key={isoTime}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-[10px] font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-mono tabular-nums">{dateStr} {timeStr}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 关联用例 ─────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-slate-500" />
                关联用例
                {selectedCaseIds.length > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {selectedCaseIds.length}
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setCasePickerOpen((v) => !v)}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 transition-colors"
              >
                {casePickerOpen ? '收起' : '展开选择'}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', casePickerOpen && 'rotate-180')} />
              </button>
            </div>

            {/* 已选用例标签列表 */}
            {selectedCases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 min-h-[36px]">
                {selectedCases.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 shadow-sm"
                  >
                    <span className={cn('rounded px-1 text-[10px] font-semibold', CASE_TYPE_COLORS[c.type] ?? '')}>
                      {CASE_TYPE_LABELS[c.type] ?? c.type}
                    </span>
                    <span className="max-w-[120px] truncate">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleCaseSelect(c.id)}
                      className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"
                      aria-label={`移除 ${c.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {selectedCases.length === 0 && !casePickerOpen && (
              <p className="text-xs text-slate-400 italic">暂未关联用例，任务运行时将跳过执行</p>
            )}

            {/* 用例选择器面板 */}
            {casePickerOpen && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-200">
                {/* 搜索 + 类型过滤 */}
                <div className="flex gap-2 p-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索用例名称..."
                      value={caseSearch}
                      onChange={(e) => setCaseSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-1">
                    {CASE_TYPE_FILTER_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCaseTypeFilter(value)}
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium border transition-all',
                          caseTypeFilter === value
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 候选用例列表 */}
                <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                  {casesLoading ? (
                    <div className="flex items-center justify-center py-6 text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm">加载中...</span>
                    </div>
                  ) : candidateCases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                      <Search className="h-5 w-5 mb-1 opacity-40" />
                      <span className="text-sm">{caseSearch ? '未找到匹配用例' : '所有用例已选完'}</span>
                    </div>
                  ) : (
                    candidateCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCaseSelect(c.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0"
                      >
                        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold', CASE_TYPE_COLORS[c.type] ?? '')}>
                          {CASE_TYPE_LABELS[c.type] ?? c.type}
                        </span>
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{c.name}</span>
                        {c.module && (
                          <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 rounded px-1.5 py-0.5 truncate max-w-[80px]">
                            {c.module}
                          </span>
                        )}
                        <Plus className="shrink-0 h-3.5 w-3.5 text-blue-500" />
                      </button>
                    ))
                  )}
                </div>

                {/* 底部统计 */}
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                  <span className="text-[11px] text-slate-400">
                    共 {casesData?.total ?? 0} 个用例，已选 {selectedCaseIds.length} 个
                  </span>
                  {selectedCaseIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCaseIds([]);
                        setSelectedCaseObjects([]);
                      }}
                      className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                    >
                      清空已选
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {TASK_MESSAGES.BTN_CANCEL}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isSaving ? TASK_MESSAGES.BTN_SAVING : task ? TASK_MESSAGES.BTN_SAVE : TASK_MESSAGES.BTN_CREATE_TASK}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
