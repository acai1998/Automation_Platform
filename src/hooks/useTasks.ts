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
  operatorId: number;
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

// ---------- 切换状态 ----------

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

export interface SchedulerStatus {
  running: number[];
  queued: number[];
  scheduled: number[];
  concurrencyLimit: number;
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

// ---------- 删除 ----------

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
