import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * 用例类型
 */
export type CaseType = 'api' | 'ui' | 'performance';

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
  /** 后端字段为 enabled（boolean），与数据库 enabled 列对应 */
  enabled: boolean;
  tags: string | null;
  owner: string | null;
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
  priority?: string[];
  owner?: string[];
}

/**
 * 获取用例列表 Hook
 */
export function useCases(params: UseCasesParams) {
  const { type, search = '', page = 1, pageSize = 10, status = 'active', priority, owner } = params;

  return useQuery<CasesResponse>({
    queryKey: ['cases', type, search, page, pageSize, status, priority, owner],
    staleTime: 0, // 每次筛选条件变化都重新请求
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        type,
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });

      if (search) {
        queryParams.set('search', search);
      }

      // 优先级支持多选，传逗号分隔字符串
      if (priority && priority.length > 0) {
        queryParams.set('priority', priority.join(','));
      }

      // 负责人支持多选，传逗号分隔字符串
      if (owner && owner.length > 0) {
        queryParams.set('owner', owner.join(','));
      }

      const response = await fetch(`/api/cases?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch cases');
      }
      return response.json();
    },
  });
}

/**
 * 用于任务关联用例选择器的 Hook
 * 支持搜索关键字和可选的类型过滤，拉取启用状态的用例（不强制要求 type 参数）
 */
export interface UseCasesForSelectParams {
  search?: string;
  type?: CaseType | '';
  enabled?: boolean;
}

/** 用例选择器单次最大加载数量（超出后用户可通过搜索筛选） */
const CASES_FOR_SELECT_LIMIT = 500;

export function useAllCasesForSelect(params: UseCasesForSelectParams = {}) {
  const { search = '', type = '', enabled = true } = params;

  return useQuery<CasesResponse>({
    queryKey: ['cases-for-select', search, type],
    staleTime: 30_000, // 30秒内不重新请求，减少弹窗内频繁请求
    enabled,
    queryFn: async () => {
      // 注意：后端 /api/cases 使用 enabled（boolean）字段，没有 status 字段
      const queryParams = new URLSearchParams({
        limit: String(CASES_FOR_SELECT_LIMIT),
        offset: '0',
        enabled: 'true',
      });

      if (type) {
        queryParams.set('type', type);
      }

      if (search.trim()) {
        queryParams.set('search', search.trim());
      }

      const response = await fetch(`/api/cases?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('获取用例列表失败');
      }
      return response.json();
    },
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