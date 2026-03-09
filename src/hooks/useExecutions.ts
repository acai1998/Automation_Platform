import { useQuery } from '@tanstack/react-query';
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
  status: 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  created_at: string;
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
    keepPreviousData: true,
  });
}

export function useTestRunDetail(id: number) {
  return useQuery<TestRunRecord | null>({
    queryKey: ['test-run', id],
    queryFn: async (): Promise<TestRunRecord | null> => {
      const result = await request<TestRunRecord>(`/executions/${id}`);
      return result.data ?? null;
    },
    enabled: !!id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    // 执行中状态每 3 秒轮询一次，已完成状态停止轮询
    refetchInterval: (data) => {
      if (data?.status === 'running' || data?.status === 'pending') return 3000;
      return false;
    },
  });
}

export type TestRunResultStatus = 'all' | 'passed' | 'failed' | 'skipped' | 'error' | 'pending';

export interface TestRunResultsOptions {
  page?: number;
  pageSize?: number;
  status?: TestRunResultStatus;
  keyword?: string;
}

export interface TestRunResultsResponse {
  success: boolean;
  data: TestRunResult[];
  total: number;
  page: number;
  pageSize: number;
}

export function useTestRunResults(id: number, options: TestRunResultsOptions = {}) {
  const { page = 1, pageSize = 20, status, keyword } = options;
  return useQuery<TestRunResultsResponse>({
    queryKey: ["test-run-results", id, page, pageSize, status, keyword],
    queryFn: async (): Promise<TestRunResultsResponse> => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status && status !== 'all') params.set('status', status);
      if (keyword && keyword.trim()) params.set('keyword', keyword.trim());
      const result = await request<TestRunResultsResponse>(`/executions/${id}/results?${params.toString()}`);
      return result.data ?? { success: false, data: [], total: 0, page, pageSize };
    },
    enabled: !!id,
    keepPreviousData: true,
  });
}
