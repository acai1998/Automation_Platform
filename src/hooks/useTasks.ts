import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  createdBy?: number;
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

// ---------- 立即运行 ----------

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch('/api/jenkins/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, triggerType: 'manual' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '触发任务失败');
      return result.data;
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

// ---------- 删除 ----------

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '删除任务失败');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
