import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * 用例类型
 */
export type CaseType = 'api' | 'ui' | 'performance';

/**
 * 用例运行状态
 */
export type RunningStatus = 'idle' | 'running';

/**
 * 用例数据接口
 */
export interface TestCase {
  id: number;
  name: string;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  module: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: CaseType;
  status: 'active' | 'inactive' | 'deprecated';
  running_status: RunningStatus;
  tags: string | null;
  script_path: string | null;
  config_json: string | null;
  created_by: number | null;
  created_by_name: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * 用例列表响应
 */
interface CasesResponse {
  success: boolean;
  data: TestCase[];
  total: number;
}

/**
 * 用例运行响应
 */
interface RunCaseResponse {
  success: boolean;
  data?: {
    caseId: number;
    caseName: string;
    status: string;
    buildUrl?: string;
    queueId?: number;
  };
  message: string;
}

/**
 * 查询参数
 */
export interface UseCasesParams {
  type: CaseType;
  search?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

/**
 * 获取用例列表 Hook
 */
export function useCases(params: UseCasesParams) {
  const { type, search = '', page = 1, pageSize = 10, status = 'active' } = params;

  return useQuery<CasesResponse>({
    queryKey: ['cases', type, search, page, pageSize, status],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        type,
        status,
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });

      if (search) {
        queryParams.set('search', search);
      }

      const response = await fetch(`/api/cases?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch cases');
      }
      return response.json();
    },
    staleTime: 30000, // 30 秒内数据视为新鲜
  });
}

/**
 * 运行用例 Hook
 */
export function useRunCase() {
  const queryClient = useQueryClient();

  return useMutation<RunCaseResponse, Error, number>({
    mutationFn: async (caseId: number) => {
      const response = await fetch(`/api/cases/${caseId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to run case');
      }

      return data;
    },
    onSuccess: () => {
      // 刷新用例列表以更新状态
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

/**
 * 更新用例状态 Hook
 */
export function useUpdateCaseStatus() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { caseId: number; status: RunningStatus }>({
    mutationFn: async ({ caseId, status }) => {
      const response = await fetch(`/api/cases/${caseId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ running_status: status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update case status');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

/**
 * 获取正在运行的用例 Hook
 */
export function useRunningCases() {
  return useQuery<{ success: boolean; data: Pick<TestCase, 'id' | 'name' | 'type' | 'running_status'>[] }>({
    queryKey: ['cases', 'running'],
    queryFn: async () => {
      const response = await fetch('/api/cases/running/list');
      if (!response.ok) {
        throw new Error('Failed to fetch running cases');
      }
      return response.json();
    },
    refetchInterval: 5000, // 每 5 秒轮询一次
  });
}

/**
 * 计算分页信息
 */
export function usePagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    totalPages,
    hasNextPage,
    hasPrevPage,
    startIndex: (page - 1) * pageSize + 1,
    endIndex: Math.min(page * pageSize, total),
  };
}
