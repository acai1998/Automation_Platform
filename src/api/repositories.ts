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

// ==================== Repository API ====================

export interface RepositoryConfig {
  id: number;
  name: string;
  description?: string;
  repo_url: string;
  branch: string;
  auth_type: 'none' | 'ssh' | 'token';
  credentials_encrypted?: string;
  script_path_pattern?: string;
  script_type: 'javascript' | 'python' | 'java' | 'other';
  status: 'active' | 'inactive' | 'error';
  last_sync_at?: string;
  last_sync_status?: string;
  sync_interval: number;
  auto_create_cases: boolean;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: number;
  repo_config_id: number;
  sync_type: 'manual' | 'scheduled' | 'webhook';
  status: 'pending' | 'running' | 'success' | 'failed';
  total_files: number;
  added_files: number;
  modified_files: number;
  deleted_files: number;
  created_cases: number;
  updated_cases: number;
  conflicts_detected: number;
  error_message?: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  triggered_by?: number;
  created_at: string;
}

export interface SyncResult {
  syncLogId: number;
  status: 'success' | 'failed';
  totalFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  createdCases: number;
  updatedCases: number;
  conflicts: number;
  duration: number;
  message: string;
}

export const repositoriesApi = {
  // 获取仓库配置列表
  getRepositories: (status?: string) =>
    request<RepositoryConfig[]>(`/repositories${status ? `?status=${status}` : ''}`),

  // 获取仓库详情
  getRepository: (id: number) =>
    request<RepositoryConfig>(`/repositories/${id}`),

  // 创建仓库配置
  createRepository: (data: {
    name: string;
    description?: string;
    repo_url: string;
    branch?: string;
    auth_type?: 'none' | 'ssh' | 'token';
    credentials_encrypted?: string;
    script_path_pattern?: string;
    script_type?: 'javascript' | 'python' | 'java' | 'other';
    sync_interval?: number;
    auto_create_cases?: boolean;
    created_by?: number;
  }) =>
    request<{ id: number }>('/repositories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 更新仓库配置
  updateRepository: (id: number, data: Partial<RepositoryConfig>) =>
    request(`/repositories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // 删除仓库配置
  deleteRepository: (id: number) =>
    request(`/repositories/${id}`, {
      method: 'DELETE',
    }),

  // 手动触发同步
  syncRepository: (id: number, triggeredBy?: number) =>
    request<SyncResult>(`/repositories/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify({ triggeredBy }),
    }),

  // 获取同步日志列表
  getSyncLogs: (id: number, limit: number = 20, offset: number = 0) =>
    request<SyncLog[]>(`/repositories/${id}/sync-logs?limit=${limit}&offset=${offset}`),

  // 获取同步日志详情
  getSyncLog: (id: number, logId: number) =>
    request<SyncLog>(`/repositories/${id}/sync-logs/${logId}`),

  // 测试仓库连接
  testConnection: (repoUrl: string) =>
    request<{ connected: boolean }>(`/repositories/test-connection`, {
      method: 'POST',
      body: JSON.stringify({ repo_url: repoUrl }),
    }),

  // 获取仓库分支列表
  getBranches: (id: number) =>
    request<string[]>(`/repositories/${id}/branches`),
};

export default repositoriesApi;