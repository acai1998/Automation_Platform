import type { AiCaseMindData, AiCaseNodeStatus, AiCaseWorkspaceStatus } from '@/types/aiCases';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  total?: number;
}

/**
 * 从本地存储中读取认证 Token
 */
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

export async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`;
  const token = getAuthToken();

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
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
  todaySuccessRate: number;
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
    request<RecentRun[]>(`/dashboard/recent-runs?limit=${limit}&_ts=${Date.now()}`, {
      cache: 'no-store',
    }),

  refreshSummary: (date?: string) =>
    request('/dashboard/refresh-summary', {
      method: 'POST',
      body: JSON.stringify({ date }),
    }),

  getAll: (timeRange: string = '30d') =>
    request<any>(`/dashboard/all?timeRange=${timeRange}&_ts=${Date.now()}`, {
      cache: 'no-store',
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

// ==================== AI Cases API ====================

export interface AiCaseWorkspaceSummary {
  id: number;
  workspaceKey: string;
  name: string;
  projectId: number | null;
  requirementText: string | null;
  status: AiCaseWorkspaceStatus;
  syncSource: 'local_import' | 'remote_direct' | 'mixed';
  version: number;
  counters: {
    totalCases: number;
    todoCases: number;
    doingCases: number;
    blockedCases: number;
    passedCases: number;
    failedCases: number;
    skippedCases: number;
  };
  lastSyncedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  updatedBy: number | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiCaseWorkspaceDetail extends AiCaseWorkspaceSummary {
  mapData: AiCaseMindData;
}

export interface AiCaseGenerationResult {
  source: 'llm' | 'fallback';
  provider: string;
  model: string;
  workspaceName: string;
  mapData: AiCaseMindData;
  counters: {
    totalCases: number;
    todoCases: number;
    doingCases: number;
    blockedCases: number;
    passedCases: number;
    failedCases: number;
    skippedCases: number;
  };
  message: string;
}

export interface AiCaseNodeExecutionItem {
  id: number;
  workspaceId: number;
  workspaceVersion: number;
  nodeId: string;
  nodeTopic: string;
  nodePath: string | null;
  previousStatus: AiCaseNodeStatus | null;
  currentStatus: AiCaseNodeStatus;
  operatorId: number | null;
  operatorName: string | null;
  comment: string | null;
  meta: unknown;
  createdAt: string;
}

export interface AiCaseAttachmentItem {
  id: number;
  workspaceId: number;
  nodeId: string;
  executionLogId: number | null;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  storageProvider: 'local' | 'oss' | 's3' | 'cos' | 'minio';
  storageBucket: string | null;
  storageKey: string;
  accessUrl: string | null;
  checksumSha256: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}

export const aiCasesApi = {
  generate: (data: {
    requirementText: string;
    workspaceName?: string;
    projectId?: number;
    persist?: boolean;
  }) => request<AiCaseGenerationResult | { generated: AiCaseGenerationResult; workspace: AiCaseWorkspaceDetail }>('/ai-cases/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  listWorkspaces: (params?: {
    projectId?: number;
    status?: AiCaseWorkspaceStatus;
    keyword?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    return request<AiCaseWorkspaceSummary[]>(`/ai-cases/workspaces?${query.toString()}`);
  },

  getWorkspace: (id: number) => request<AiCaseWorkspaceDetail>(`/ai-cases/workspaces/${id}`),

  createWorkspace: (data: {
    workspaceKey?: string;
    name: string;
    projectId?: number | null;
    requirementText?: string | null;
    mapData: AiCaseMindData;
    status?: AiCaseWorkspaceStatus;
    syncSource?: 'local_import' | 'remote_direct' | 'mixed';
  }) => request<AiCaseWorkspaceDetail>('/ai-cases/workspaces', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateWorkspace: (
    id: number,
    data: {
      name?: string;
      projectId?: number | null;
      requirementText?: string | null;
      mapData?: AiCaseMindData;
      status?: AiCaseWorkspaceStatus;
      syncSource?: 'local_import' | 'remote_direct' | 'mixed';
      expectedVersion?: number;
    }
  ) => request<AiCaseWorkspaceDetail>(`/ai-cases/workspaces/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  updateNodeStatus: (
    workspaceId: number,
    data: {
      nodeId: string;
      status: AiCaseNodeStatus;
      comment?: string;
      meta?: Record<string, unknown>;
    }
  ) => request<{ executionId: number; workspace: AiCaseWorkspaceDetail }>(`/ai-cases/workspaces/${workspaceId}/node-status`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  listNodeExecutions: (
    workspaceId: number,
    params?: {
      nodeId?: string;
      limit?: number;
      offset?: number;
    }
  ) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    return request<AiCaseNodeExecutionItem[]>(`/ai-cases/workspaces/${workspaceId}/node-executions?${query.toString()}`);
  },

  createAttachment: (
    workspaceId: number,
    data: {
      nodeId: string;
      executionLogId?: number | null;
      fileName: string;
      mimeType?: string | null;
      fileSize?: number;
      storageProvider?: 'local' | 'oss' | 's3' | 'cos' | 'minio';
      storageBucket?: string | null;
      storageKey: string;
      accessUrl?: string | null;
      checksumSha256?: string | null;
    }
  ) => request<AiCaseAttachmentItem>(`/ai-cases/workspaces/${workspaceId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  listAttachments: (
    workspaceId: number,
    params?: {
      nodeId?: string;
      limit?: number;
      offset?: number;
    }
  ) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    return request<AiCaseAttachmentItem[]>(`/ai-cases/workspaces/${workspaceId}/attachments?${query.toString()}`);
  },

  deleteAttachment: (attachmentId: number) => request(`/ai-cases/attachments/${attachmentId}`, {
    method: 'DELETE',
  }),
};
