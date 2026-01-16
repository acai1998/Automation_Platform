import { useQuery } from '@tanstack/react-query';

export interface TestRunRecord {
  id: number;
  project_id: number;
  project_name: string;
  trigger_type: 'manual' | 'jenkins' | 'schedule';
  trigger_by: number;
  trigger_by_name: string;
  jenkins_job: string;
  jenkins_build_id: string;
  jenkins_url: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  start_time: string;
  end_time: string;
  duration_ms: number;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  created_at: string;
}

export interface Auto_TestRunResults {
  id: number;
  execution_id: number;
  case_id: number;
  case_name: string;
  module: string;
  priority: string;
  type: string;
  status: 'passed' | 'failed' | 'skipped' | 'error' | 'pending';
  start_time: string;
  end_time: string;
  duration: number;
  error_message: string;
  error_stack: string;
  screenshot_path: string;
  log_path: string;
}

interface TestRunsResponse {
  success: boolean;
  data: TestRunRecord[];
  total: number;
}

export function useTestRuns(page = 1, pageSize = 10) {
  return useQuery<TestRunsResponse>({
    queryKey: ['test-runs', page, pageSize],
    queryFn: async () => {
      const offset = (page - 1) * pageSize;
      const response = await fetch(`/api/executions/test-runs?limit=${pageSize}&offset=${offset}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取运行记录失败');
      return result;
    },
    keepPreviousData: true,
  });
}

export function useTestRunDetail(id: number) {
  return useQuery<{ success: boolean; data: TestRunRecord }>({
    queryKey: ['test-run', id],
    queryFn: async () => {
      const response = await fetch(`/api/jenkins/batch/${id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取详情失败');
      return result;
    },
    enabled: !!id,
  });
}

export function useTestRunResults(id: number) {
  return useQuery<{ success: boolean; data: Auto_TestRunResults[] }>({
    queryKey: ['test-run-results', id],
    queryFn: async () => {
      const response = await fetch(`/api/executions/${id}/results`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '获取结果失败');
      return result;
    },
    enabled: !!id,
  });
}