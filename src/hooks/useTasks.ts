import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToken } from '../services/authApi';

export interface Task {
  id: number;
  name: string;
  description?: string;
  project_id?: number;
  project_name?: string;
  case_ids?: string;
  trigger_type: 'manual' | 'scheduled' | 'ci_triggered';
  cron_expression?: string;
  environment_id?: number;
  environment_name?: string;
  status: 'active' | 'paused' | 'archived';
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at: string;
  recentExecutions?: TaskExecution[];
  /** 最近一次关联的 Auto_TestRun.id，用于跳转报告 */
  latestRunId?: number | null;
}

export interface TaskExecution {
  id: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  start_time?: string;
  end_time?: string;
  duration?: number;
  passed_cases: number;
  failed_cases: number;
  total_cases: number;
}

export interface TaskListParams {
  projectId?: number;
  status?: string;
  triggerType?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface TaskListResult {
  data: Task[];
  total: number;
  stats?: {
    activeCount: number;
    todayRuns: number;
  };
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  projectId?: number;
  caseIds?: number[];
  triggerType?: 'manual' | 'scheduled' | 'ci_triggered';
  cronExpression?: string;
  environmentId?: number;
  // 注：createdBy 由后端从认证上下文获取，前端无需传入
  /** 失败重试次数，默认 1（后端存储字段） */
  maxRetries?: number;
  /** 重试延迟毫秒，默认 30000（后端存储字段） */
  retryDelayMs?: number;
}

// ---- 任务统计 ----

export interface TaskStatsSummary {
  total: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  avgDurationSec: number;
  lastRunAt: string | null;
  periodDays: number;
}

export interface TaskStatsTrendItem {
  day: string;
  total: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  avgDurationSec: number;
}

export interface TaskStatsTopError {
  errorMessage: string;
  count: number;
}

export interface TaskStatsResult {
  summary: TaskStatsSummary;
  trend: TaskStatsTrendItem[];
  topErrors: TaskStatsTopError[];
}

// ---- 审计日志 ----

export interface AuditLogEntry {
  id: number;
  action: string;
  operatorId: number | null;   // null = 系统自动操作
  operatorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogsResult {
  data: AuditLogEntry[];
  total: number;
}

export interface UpdateTaskInput {
  id: number;
  name?: string;
  description?: string;
  projectId?: number;
  caseIds?: number[];
  triggerType?: 'manual' | 'scheduled' | 'ci_triggered';
  cronExpression?: string;
  environmentId?: number;
  status?: 'active' | 'paused' | 'archived';
}

// ---------- 列表 ----------

export function useTasks(params: TaskListParams = {}) {
  return useQuery<TaskListResult>({
    queryKey: ['tasks', params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.projectId != null) qs.set('projectId', String(params.projectId));
      if (params.status) qs.set('status', params.status);
      if (params.triggerType) qs.set('triggerType', params.triggerType);
      if (params.keyword?.trim()) qs.set('keyword', params.keyword.trim());
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.offset != null) qs.set('offset', String(params.offset));

      const response = await fetch(`/api/tasks?${qs}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取任务列表失败');

      return {
        data: result.data as Task[],
        total: result.total ?? result.data.length,
        stats: result.stats,
      };
    },
  });
}

// ---------- 单条详情 ----------

export function useTaskDetail(id: number | null) {
  return useQuery<Task>({
    queryKey: ['task-detail', id],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取任务详情失败');
      return result.data as Task;
    },
    enabled: id != null,
  });
}

// ---------- 立即运行（通过调度引擎，受并发上限保护） ----------

// 构建统一的认证请求头工具函数
function buildAuthHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '触发任务失败');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['test-runs'] });
    },
  });
}

// ---------- 创建 ----------

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '创建任务失败');
      return result.data as { id: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ---------- 更新 ----------

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskInput) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: buildAuthHeaders(),
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '更新任务失败');
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-detail', variables.id] });
    },
  });
}

// ---------- 切换状态（带乐观更新） ----------

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'active' | 'paused' | 'archived' }) => {
      const response = await fetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '更新任务状态失败');
      return result;
    },

    // 乐观更新：在 API 调用前立即更新缓存
    onMutate: async ({ id, status }) => {
      // 1. 取消所有正在进行的 tasks 查询，防止覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // 2. 快照当前缓存状态用于回滚
      const previousTasksData = queryClient.getQueriesData<TaskListResult>({ queryKey: ['tasks'] });

      // 3. 乐观更新所有匹配的 tasks 查询缓存
      queryClient.setQueriesData<TaskListResult>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return old;

        return {
          ...old,
          data: old.data.map(task =>
            task.id === id ? { ...task, status } : task
          ),
        };
      });

      // 4. 返回快照用于错误回滚
      return { previousTasksData };
    },

    // 错误回滚：API 失败时恢复之前的缓存状态
    onError: (_error, _variables, context) => {
      // 恢复所有快照的查询数据
      if (context?.previousTasksData) {
        context.previousTasksData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    // 成功后同步：确保与服务器状态一致
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-detail', variables.id] });
    },
  });
}

// ---------- 取消执行 ----------

export function useCancelExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, execId }: { taskId: number; execId: number }) => {
      const response = await fetch(`/api/tasks/${taskId}/executions/${execId}/cancel`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '取消执行失败');
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-detail', variables.taskId] });
    },
  });
}

// ---------- 任务统计 ----------

export function useTaskStats(taskId: number | null, days = 30) {
  return useQuery<TaskStatsResult>({
    queryKey: ['task-stats', taskId, days],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/stats?days=${days}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取任务统计失败');
      return result.data as TaskStatsResult;
    },
    enabled: taskId != null,
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
  });
}

// ---------- 审计日志 ----------

export function useTaskAuditLogs(taskId: number | null, limit = 50, offset = 0) {
  return useQuery<AuditLogsResult>({
    queryKey: ['task-audit-logs', taskId, limit, offset],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/audit-logs?limit=${limit}&offset=${offset}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取审计日志失败');
      return { data: result.data as AuditLogEntry[], total: result.total };
    },
    enabled: taskId != null,
  });
}

// ---------- 调度器状态 ----------

/** [P1] 运行中槽位详情 */
export interface RunningSlotInfo {
  taskId: number;
  runId: number;
  elapsedMs: number;
  /** 直连执行标签（如 "case:123" / "batch:5,6,7"），任务调度时为 undefined */
  label?: string;
}

/** [P1] 队列项详情（任务调度队列） */
export interface QueuedItemInfo {
  taskId: number;
  triggerReason: string;
  waitMs: number;
  priority: number;
  queuePosition: number;
}

/** 直连等待队列项详情（run-case / run-batch 专用） */
export interface DirectQueuedItemInfo {
  label: string;
  waitMs: number;
  queuePosition: number;
}

export interface SchedulerStatus {
  /** [P1] 运行中的槽位详情（runId 维度，含任务调度和直连执行） */
  running: RunningSlotInfo[];
  /** [P1] 任务调度等待队列详情（含优先级、等待时长） */
  queued: QueuedItemInfo[];
  /** 直连执行等待队列详情（run-case / run-batch） */
  directQueued: DirectQueuedItemInfo[];
  scheduled: number[];
  concurrencyLimit: number;
  /** [P1] 任务调度队列深度 */
  queueDepth: number;
  /** 直连队列深度 */
  directQueueDepth: number;
  /** [P1] 队列最大深度 */
  maxQueueDepth: number;
}

export function useSchedulerStatus() {
  return useQuery<SchedulerStatus>({
    queryKey: ['scheduler-status'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/scheduler/status');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取调度器状态失败');
      return result.data as SchedulerStatus;
    },
    refetchInterval: 10_000,          // 每10秒刷新一次
    refetchIntervalInBackground: false, // 切换到后台标签页时停止轮询，节省请求
  });
}

// ---------- 删除（带乐观更新） ----------

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '删除任务失败');
      return result;
    },

    // 乐观更新：在 API 调用前立即从缓存中移除任务
    onMutate: async (taskId) => {
      // 1. 取消所有正在进行的 tasks 查询
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // 2. 快照当前缓存状态用于回滚
      const previousTasksData = queryClient.getQueriesData<TaskListResult>({ queryKey: ['tasks'] });

      // 3. 乐观移除任务并更新总数
      queryClient.setQueriesData<TaskListResult>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return old;

        return {
          ...old,
          data: old.data.filter(task => task.id !== taskId),
          total: Math.max(0, old.total - 1), // 确保总数不为负
        };
      });

      // 4. 返回快照用于错误回滚
      return { previousTasksData };
    },

    // 错误回滚：API 失败时恢复之前的缓存状态
    onError: (_error, _taskId, context) => {
      // 恢复所有快照的查询数据
      if (context?.previousTasksData) {
        context.previousTasksData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    // 成功后同步：刷新分页和统计数据
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ---------- 批量操作结果 ----------

export interface BatchOperationResult {
  successes: number;
  failures: number;
  total: number;
  failedTaskIds: number[];
}

// ---------- 批量更新状态 ----------

export function useBatchUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskIds,
      status
    }: {
      taskIds: number[];
      status: 'active' | 'paused' | 'archived'
    }): Promise<BatchOperationResult> => {
      // 限制最大并发为 3，避免同时发出大量请求拥塞后端
      const results = await runWithConcurrencyLimit(
        taskIds,
        (id) =>
          fetch(`/api/tasks/${id}/status`, {
            method: 'PATCH',
            headers: buildAuthHeaders(),
            body: JSON.stringify({ status }),
          }).then(res => {
            if (!res.ok) throw new Error(`Task ${id} failed`);
            return res.json();
          }),
        3
      );

      const failedTaskIds = results
        .map((result, index) => (result.status === 'rejected' ? taskIds[index] : null))
        .filter((id): id is number => id !== null);

      const successes = taskIds.length - failedTaskIds.length;
      const failures = failedTaskIds.length;

      return { successes, failures, total: taskIds.length, failedTaskIds };
    },

    // 乐观更新所有选中的任务
    onMutate: async ({ taskIds, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      const previousTasksData = queryClient.getQueriesData<TaskListResult>({
        queryKey: ['tasks']
      });

      // 批量更新所有选中任务的状态
      queryClient.setQueriesData<TaskListResult>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return old;

        return {
          ...old,
          data: old.data.map(task =>
            taskIds.includes(task.id) ? { ...task, status } : task
          ),
        };
      });

      return { previousTasksData };
    },

    // 错误回滚
    onError: (_error, _variables, context) => {
      if (context?.previousTasksData) {
        context.previousTasksData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    // 成功后同步
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ---------- 批量删除 ----------

export function useBatchDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: number[]): Promise<BatchOperationResult> => {
      // 限制最大并发为 3，避免同时发出大量请求拥塞后端
      const results = await runWithConcurrencyLimit(
        taskIds,
        (id) =>
          fetch(`/api/tasks/${id}`, {
            method: 'DELETE',
            headers: buildAuthHeaders(),
          }).then(res => {
            if (!res.ok) throw new Error(`Task ${id} failed`);
            return res.json();
          }),
        3
      );

      const failedTaskIds = results
        .map((result, index) => (result.status === 'rejected' ? taskIds[index] : null))
        .filter((id): id is number => id !== null);

      const successes = taskIds.length - failedTaskIds.length;
      const failures = failedTaskIds.length;

      return { successes, failures, total: taskIds.length, failedTaskIds };
    },

    // 乐观移除所有选中的任务
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      const previousTasksData = queryClient.getQueriesData<TaskListResult>({
        queryKey: ['tasks']
      });

      queryClient.setQueriesData<TaskListResult>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return old;

        return {
          ...old,
          data: old.data.filter(task => !taskIds.includes(task.id)),
          total: Math.max(0, old.total - taskIds.length),
        };
      });

      return { previousTasksData };
    },

    // 错误回滚
    onError: (_error, _taskIds, context) => {
      if (context?.previousTasksData) {
        context.previousTasksData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },

    // 成功后同步
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ---------- Cron 表达式预览 ----------

export interface CronPreviewResult {
  times: string[]; // ISO 8601 字符串数组
}

/**
 * 根据 Cron 表达式预览未来 N 次触发时间
 * @param cronExpression 标准 5 段 cron 表达式
 * @param count 预览次数，默认 5
 */
export function useCronPreview(cronExpression: string, count = 5) {
  const trimmed = cronExpression.trim();

  // 简单前端格式预检：5段 + 合法字符，避免无效表达式发请求
  const isLikelyValid =
    trimmed.split(/\s+/).length === 5 &&
    /^[\d\*\-,\/\s]+$/.test(trimmed);

  return useQuery<CronPreviewResult>({
    // queryKey 使用 trimmed，与 queryFn 一致，避免多余空白导致缓存 miss
    queryKey: ['cron-preview', trimmed, count],
    queryFn: async () => {
      const qs = new URLSearchParams({ expr: trimmed, count: String(count) });
      const response = await fetch(`/api/tasks/cron/preview?${qs}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Cron 预览失败');
      return result.data as CronPreviewResult;
    },
    enabled: isLikelyValid,
    staleTime: 60_000, // 同一表达式 1 分钟内不重复请求
    retry: false,      // 格式错误不重试
  });
}

// ---------- 批量运行 ----------

/**
 * 限并发批量执行异步任务
 * @param items 待处理项列表
 * @param fn 每项的异步处理函数
 * @param concurrency 最大并发数（默认 3）
 * @returns PromiseSettledResult 数组，与 Promise.allSettled 返回格式一致
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 3
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      try {
        const value = await fn(items[current]);
        results[current] = { status: 'fulfilled', value };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  }

  // 启动 concurrency 个 worker 同时跑
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export function useBatchRunTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskIds: number[]): Promise<BatchOperationResult> => {
      // 限制最大并发为 3，避免同时发出大量请求拥塞后端调度器和 DB 连接池
      const results = await runWithConcurrencyLimit(
        taskIds,
        (id) =>
          fetch(`/api/tasks/${id}/run`, {
            method: 'POST',
            headers: buildAuthHeaders(),
          }).then(res => {
            if (!res.ok) throw new Error(`Task ${id} failed`);
            return res.json();
          }),
        3
      );

      const failedTaskIds = results
        .map((result, index) => (result.status === 'rejected' ? taskIds[index] : null))
        .filter((id): id is number => id !== null);

      const successes = taskIds.length - failedTaskIds.length;
      const failures = failedTaskIds.length;

      return { successes, failures, total: taskIds.length, failedTaskIds };
    },

    // 批量运行不需要乐观更新，因为运行状态由服务器控制

    // 成功后刷新任务列表和测试运行记录
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['test-runs'] });
    },
  });
}
