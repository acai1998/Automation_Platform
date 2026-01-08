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
  created_by_name?: string;
  updated_at: string;
  recentExecutions?: TaskExecution[];
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

export function useTasks(projectId?: number) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const url = projectId ? `/api/tasks?projectId=${projectId}` : '/api/tasks';
      const response = await fetch(url);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取任务列表失败');
      
      // 为每个任务获取详情（包含最近执行记录）
      const tasksWithDetails = await Promise.all(
        result.data.map(async (task: Task) => {
          const detailRes = await fetch(`/api/tasks/${task.id}`);
          const detailResult = await detailRes.json();
          return detailResult.success ? detailResult.data : task;
        })
      );
      
      return tasksWithDetails as Task[];
    },
  });
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/jenkins/trigger`, {
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
    },
  });
}