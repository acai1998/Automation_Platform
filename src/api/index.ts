const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  total?: number;
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data;
  } catch (error: any) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

// ==================== Dashboard API ====================

export interface DashboardStats {
  totalCases: number;
  todayRuns: number;
  todaySuccessRate: number | null;
  runningTasks: number;
}

export interface TodayExecution {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface DailySummary {
  date: string;
  totalExecutions: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  successRate: number;
}

export interface ComparisonData {
  runsComparison: number | null;
  successRateComparison: number | null;
  failureComparison: number | null;
}

export interface RecentRun {
  id: number;
  suiteName: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  duration: number | null;
  startTime: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  executedBy: string;
  executedById: number;
}

export const dashboardApi = {
  getStats: () => request<DashboardStats>('/dashboard/stats'),

  getTodayExecution: () => request<TodayExecution>('/dashboard/today-execution'),

  getTrend: (days: number = 30) =>
    request<DailySummary[]>(`/dashboard/trend?days=${days}`),

  getComparison: (days: number = 30) =>
    request<ComparisonData>(`/dashboard/comparison?days=${days}`),

  getRecentRuns: (limit: number = 10) =>
    request<RecentRun[]>(`/dashboard/recent-runs?limit=${limit}`),

  refreshSummary: (date?: string) =>
    request('/dashboard/refresh-summary', {
      method: 'POST',
      body: JSON.stringify({ date }),
    }),
};

// ==================== Execution API ====================

export interface ExecutionResult {
  executionId: number;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  status: string;
}

export interface ExecutionDetail {
  execution: any;
  caseResults: any[];
}

export const executionApi = {
  run: (taskId: number, triggeredBy: number = 1) =>
    request<ExecutionResult>('/executions/run', {
      method: 'POST',
      body: JSON.stringify({ taskId, triggeredBy }),
    }),

  getDetail: (id: number) => request<ExecutionDetail>(`/executions/${id}`),

  getList: (limit: number = 20) => request<any[]>(`/executions?limit=${limit}`),

  cancel: (id: number) =>
    request(`/executions/${id}/cancel`, { method: 'POST' }),

  getAvailableRunners: () =>
    request<{ type: string; name: string; available: boolean }[]>(
      '/executions/runners/available'
    ),
};

// ==================== Cases API ====================

export interface TestCase {
  id: number;
  name: string;
  description: string | null;
  projectId: number | null;
  projectName: string | null;
  module: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'api' | 'postman' | 'pytest' | 'playwright';
  status: 'active' | 'inactive' | 'deprecated';
  tags: string | null;
  configJson: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCaseInput {
  name: string;
  description?: string;
  projectId?: number;
  module?: string;
  priority?: string;
  type?: string;
  tags?: string;
  configJson?: object;
}

export const casesApi = {
  getList: (params?: {
    projectId?: number;
    module?: string;
    status?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.append(key, String(value));
      });
    }
    return request<TestCase[]>(`/cases?${query}`);
  },

  getDetail: (id: number) => request<TestCase>(`/cases/${id}`),

  create: (data: CreateCaseInput) =>
    request<{ id: number }>('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<CreateCaseInput>) =>
    request(`/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request(`/cases/${id}`, { method: 'DELETE' }),

  getModules: () => request<string[]>('/cases/modules/list'),
};

// ==================== Tasks API ====================

export interface Task {
  id: number;
  name: string;
  description: string | null;
  projectId: number | null;
  projectName: string | null;
  caseIds: string;
  triggerType: 'manual' | 'scheduled' | 'ci_triggered';
  cronExpression: string | null;
  environmentId: number | null;
  environmentName: string | null;
  status: 'active' | 'paused' | 'archived';
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  projectId?: number;
  caseIds?: number[];
  triggerType?: string;
  cronExpression?: string;
  environmentId?: number;
}

export const tasksApi = {
  getList: (params?: { projectId?: number; status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.append(key, String(value));
      });
    }
    return request<Task[]>(`/tasks?${query}`);
  },

  getDetail: (id: number) => request<Task & { cases: any[]; recentExecutions: any[] }>(`/tasks/${id}`),

  create: (data: CreateTaskInput) =>
    request<{ id: number }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<CreateTaskInput & { status?: string }>) =>
    request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request(`/tasks/${id}`, { method: 'DELETE' }),

  getExecutions: (id: number, limit: number = 20) =>
    request<any[]>(`/tasks/${id}/executions?limit=${limit}`),
};
