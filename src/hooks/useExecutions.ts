import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { request } from '../api';

export interface TestRunRecord {
  id: number;
  project_id: number;
  project_name: string;
  trigger_type: 'manual' | 'jenkins' | 'schedule' | 'ci_triggered';
  trigger_by: number;
  trigger_by_name: string;
  jenkins_job: string | null;
  jenkins_build_id: string | null;
  jenkins_url: string | null;
  abort_reason: string | null;
  status: 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  start_time: string | null;
  end_time: string | null;
  duration_ms: number | null;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  created_at: string | null;
}

export interface TestRunResult {
  id: number;
  execution_id: number;
  case_id: number | null;
  case_name: string;
  module: string | null;
  priority: string | null;
  type: string | null;
  status: 'passed' | 'failed' | 'skipped' | 'error' | 'pending';
  start_time: string | null;
  end_time: string | null;
  duration: number | null;
  error_message: string | null;
  error_stack: string | null;
  screenshot_path: string | null;
  log_path: string | null;
  assertions_total: number | null;
  assertions_passed: number | null;
  response_data: string | null;
}

interface TestRunsResponse {
  success: boolean;
  data: TestRunRecord[];
  total: number;
}

export interface StaleExecutionSummary {
  stalePendingNoStartCount: number;
  staleStartedCount: number;
  totalStaleCount: number;
  latestStalePendingCreatedAt: string | null;
  maxAgeHours: number;
  stalePendingMinutes: number;
}

interface CleanupStaleResponse {
  dryRun: boolean;
  affectedCount: number;
  stalePendingNoStartCount: number;
  staleStartedCount: number;
  totalStaleCount: number;
  latestStalePendingCreatedAt: string | null;
  maxAgeHours: number;
  stalePendingMinutes: number;
}

export interface JenkinsHealthStatus {
  connected: boolean;
  message: string;
  checkedAt: string;
  version?: string;
  statusCode?: number;
}

export interface TestRunFilters {
  triggerType?: string[];
  status?: string[];
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export function useTestRuns(page = 1, pageSize = 10, filters: TestRunFilters = {}) {
  return useQuery<TestRunsResponse>({
    // 将 filters 展开为基本类型字段，避免对象引用导致 queryKey miss
    queryKey: ['test-runs', page, pageSize, filters.triggerType?.join(',')??'', filters.status?.join(',')??'', filters.startDate??'', filters.endDate??''],
    queryFn: async (): Promise<TestRunsResponse> => {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (filters.triggerType?.length) params.set('triggerType', filters.triggerType.join(','));
      if (filters.status?.length) params.set('status', filters.status.join(','));
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      const result = await request<TestRunRecord[]>(`/executions/test-runs?${params.toString()}`);
      return {
        success: result.success,
        data: result.data ?? [],
        total: result.total ?? 0,
      };
    },
    // staleTime: 0 确保每次挂载（切换到报告页）时都检查缓存是否失效并重新请求
    staleTime: 0,
    keepPreviousData: true,
  });
}

const TERMINAL_STATUSES = new Set(['success', 'failed', 'aborted']);

export function useStaleExecutionSummary(maxAgeHours = 24, stalePendingMinutes = 10) {
  return useQuery<{ success: boolean; data?: StaleExecutionSummary }>({
    queryKey: ['stale-execution-summary', maxAgeHours, stalePendingMinutes],
    queryFn: async () => {
      const params = new URLSearchParams({
        maxAgeHours: String(maxAgeHours),
        stalePendingMinutes: String(stalePendingMinutes),
      });
      return request<StaleExecutionSummary>(`/executions/stale-summary?${params.toString()}`);
    },
    staleTime: 30 * 1000,
  });
}

export function useCleanupStaleExecutions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload?: { maxAgeHours?: number; stalePendingMinutes?: number; dryRun?: boolean }) => {
      const result = await request<CleanupStaleResponse>('/executions/cleanup-stale', {
        method: 'POST',
        body: JSON.stringify({
          maxAgeHours: payload?.maxAgeHours ?? 24,
          stalePendingMinutes: payload?.stalePendingMinutes ?? 10,
          dryRun: payload?.dryRun ?? false,
        }),
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-runs'] });
      queryClient.invalidateQueries({ queryKey: ['stale-execution-summary'] });
    },
  });
}

export function useJenkinsHealthStatus() {
  return useQuery<JenkinsHealthStatus>({
    queryKey: ['jenkins-health'],
    queryFn: async () => {
      try {
        const result = await request<{ connected?: boolean; version?: string; status?: number }>('/jenkins/health');
        return {
          connected: Boolean(result.data?.connected),
          message: result.message || 'Jenkins is healthy',
          checkedAt: new Date().toISOString(),
          version: result.data?.version,
          statusCode: result.data?.status,
        };
      } catch (error) {
        return {
          connected: false,
          message: error instanceof Error ? error.message : 'Jenkins health check failed',
          checkedAt: new Date().toISOString(),
        };
      }
    },
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  });
}

export function useTestRunDetail(id: number) {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | null>(null);

  const query = useQuery<TestRunRecord | null>({
    queryKey: ['test-run', id],
    queryFn: async (): Promise<TestRunRecord | null> => {
      const result = await request<TestRunRecord>(`/executions/${id}`);
      return result.data ?? null;
    },
    enabled: !!id,
    // 不设置 staleTime（默认0），确保每次 refetch 都拿最新数据
    refetchOnWindowFocus: false,
    // 执行中状态每 3 秒轮询一次，已完成状态停止轮询
    refetchInterval: (data) => {
      if (data?.status === 'running' || data?.status === 'pending') return 3000;
      return false;
    },
  });

  // 当状态从 running/pending 切换到终态时，延迟 1s 再刷新一次
  // 确保后端回调写入完成后，前端能拿到最终的 passed_cases 等统计数据
  useEffect(() => {
    const currentStatus = query.data?.status ?? null;
    const prevStatus = prevStatusRef.current;

    if (
      prevStatus !== null &&
      (prevStatus === 'running' || prevStatus === 'pending') &&
      currentStatus !== null &&
      TERMINAL_STATUSES.has(currentStatus)
    ) {
      // 状态刚变为终态，等 1 秒后再刷新一次，确保后端写入最终统计数据
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['test-run', id] });
        queryClient.invalidateQueries({ queryKey: ['test-run-results', id] });
      }, 1000);
      return () => clearTimeout(timer);
    }

    prevStatusRef.current = currentStatus;
  }, [query.data?.status, id, queryClient]);

  return query;
}

export type TestRunResultStatus = 'all' | 'passed' | 'failed' | 'skipped' | 'error' | 'pending';

export interface TestRunResultsOptions {
  page?: number;
  pageSize?: number;
  status?: TestRunResultStatus;
  keyword?: string;
}

export interface SchedulerTraceLogItem {
  id: string;
  source: 'run' | 'audit';
  action: string;
  createdAt: string | null;
  operatorId: number | null;
  operatorName: string | null;
  message: string;
  metadata: Record<string, unknown>;
}

export interface TestRunResultsResponse {
  success: boolean;
  data: TestRunResult[];
  total: number;
  page: number;
  pageSize: number;
}

export function useTestRunSchedulerLogs(id: number) {
  return useQuery<SchedulerTraceLogItem[]>({
    queryKey: ['test-run-scheduler-logs', id],
    queryFn: async () => {
      const result = await request<SchedulerTraceLogItem[]>(`/executions/test-runs/${id}/scheduler-logs`);
      return result.data ?? [];
    },
    enabled: !!id,
    staleTime: 10 * 1000,
  });
}

export function useTestRunResults(id: number, options: TestRunResultsOptions = {}) {
  const { page = 1, pageSize = 20, status, keyword } = options;
  return useQuery<TestRunResultsResponse>({
    queryKey: ["test-run-results", id, page, pageSize, status, keyword],
    queryFn: async (): Promise<TestRunResultsResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status && status !== 'all') params.set('status', status);
      if (keyword && keyword.trim()) params.set('keyword', keyword.trim());
      // 注意：/executions/:id/results 直接返回扁平结构
      // { success, data: TestRunResult[], total, page, pageSize }
      // request() 的泛型 T 对应 data 字段，但此接口 data 本身就是完整响应
      // 所以直接用 fetch 解析，绕过 request() 的 .data 封装
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      const resp = await fetch(`/api/executions/${id}/results?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!resp.ok) throw new Error('Failed to fetch results');
      const json: TestRunResultsResponse = await resp.json();
      if (!Array.isArray(json.data)) {
        return { success: false, data: [], total: 0, page, pageSize };
      }
      return json;
    },
    enabled: !!id,
    keepPreviousData: true,
  });
}
