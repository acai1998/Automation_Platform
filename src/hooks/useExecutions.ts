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