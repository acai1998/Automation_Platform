import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { request } from '../api';

export interface ExecuteResult {
  runId: number;
  buildUrl: string;
  status: string;
}

export interface BatchExecution {
  id: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'aborted';
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  jenkins_build_url?: string;
  start_time?: string;
  end_time?: string;
  duration_ms?: number;
}

export interface SyncStatus {
  runId: number;
  status: 'waiting_callback' | 'polling' | 'completed' | 'failed' | 'timeout';
  lastUpdate: string;
  attempts: number;
  method: 'callback' | 'polling' | 'timeout';
  message: string;
}

export interface MonitoringStatus {
  isMonitoring: boolean;
  strategy?: {
    callbackTimeout: number;
    pollInterval: number;
    maxPollAttempts: number;
    priority: 'low' | 'normal' | 'high';
    description: string;
  };
  startTime?: string;
  duration?: number;
  syncStatus?: SyncStatus;
}

/**
 * 执行单个用例
 */
export function useExecuteCase() {
  return useMutation({
    mutationFn: async (data: { caseId: number; projectId: number }) => {
      const result = await request<ExecuteResult>('/jenkins/run-case', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result.data as ExecuteResult;
    },
  });
}

/**
 * 批量执行用例
 */
export function useExecuteBatch() {
  return useMutation({
    mutationFn: async (data: { caseIds: number[]; projectId: number }) => {
      const result = await request<ExecuteResult>('/jenkins/run-batch', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result.data as ExecuteResult;
    },
  });
}

/**
 * 获取执行批次详情（含智能轮询功能）
 * 优化说明：
 * 1. 集成混合状态同步机制，支持回调+轮询双重保障
 * 2. 智能轮询间隔调整：根据监控状态动态调整
 * 3. 添加状态异常检测和告警提醒
 * 4. 支持手动重试和状态强制同步
 */
export function useBatchExecution(runId: number | null, options?: {
  pollInterval?: number;
  enableSmartPolling?: boolean;
  onStatusChange?: (status: string, prevStatus?: string) => void;
  onSyncIssue?: (issue: string) => void;
}) {
  const {
    pollInterval = 10000,
    enableSmartPolling = true,
    onStatusChange,
    onSyncIssue
  } = options || {};

  const prevStatusRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['batch-execution', runId],
    queryFn: async () => {
      if (!runId) return null;
      const result = await request<BatchExecution>(`/jenkins/batch/${runId}`);
      return result.data as BatchExecution;
    },
    enabled: !!runId,
    refetchInterval: (data) => {
      if (!data) return false;

      // 检查是否超过最大轮询时长 (基于 start_time)
      if (data.start_time) {
        const startTime = new Date(data.start_time).getTime();
        const MAX_POLL_DURATION = 10 * 60 * 1000; // 10分钟
        if (Date.now() - startTime > MAX_POLL_DURATION) {
          console.log('[Polling] 已达到最大轮询时长（10分钟），停止轮询');
          return false;
        }
      }

      // 智能轮询间隔调整
      if (enableSmartPolling && (data.status === 'running' || data.status === 'pending')) {
        let duration = 0;
        if (data.start_time) {
          duration = Date.now() - new Date(data.start_time).getTime();
        }
        
        // 根据执行时长动态调整轮询间隔
        if (duration < 2 * 60 * 1000) return 5000; // 5秒
        if (duration < 5 * 60 * 1000) return 10000; // 10秒
        return 30000; // 30秒
      }

      // 传统轮询逻辑
      if (data.status === 'running' || data.status === 'pending') {
        return pollInterval;
      }

      return false;
    },
    staleTime: 3000, // 3秒缓存
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // 使用 useEffect 处理状态变化副作用
  useEffect(() => {
    const data = query.data;
    if (data && prevStatusRef.current && prevStatusRef.current !== data.status) {
      onStatusChange?.(data.status, prevStatusRef.current);
    }
    if (data) {
      prevStatusRef.current = data.status;
    }
  }, [query.data, onStatusChange]);

  return query;
}

/**
 * 获取执行监控状态
 */
export function useMonitoringStatus(runId: number | null) {
  return useQuery({
    queryKey: ['monitoring-status', runId],
    queryFn: async () => {
      if (!runId) return null;
      const result = await request<MonitoringStatus>(`/monitoring/status/${runId}`);
      return result.data as MonitoringStatus;
    },
    enabled: !!runId,
    refetchInterval: 15000, // 15秒轮询监控状态
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });
}

/**
 * 手动状态同步
 */
export function useManualSync() {
  return useMutation({
    mutationFn: async (runId: number) => {
      return request(`/monitoring/sync/${runId}`, {
        method: 'POST',
      });
    },
  });
}

/**
 * 完整的执行管理 hook（增强版）
 * 集成混合状态同步、智能监控和异常处理
 */
export function useTestExecution(options?: {
  enableSmartPolling?: boolean;
  onStatusChange?: (status: string, prevStatus?: string) => void;
  onSyncIssue?: (issue: string) => void;
  onExecutionComplete?: (result: BatchExecution) => void;
}) {
  const [runId, setRunId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncIssues, setSyncIssues] = useState<string[]>([]);

  const executeCase = useExecuteCase();
  const executeBatch = useExecuteBatch();
  const manualSync = useManualSync();

  // 执行监控状态
  const monitoringStatus = useMonitoringStatus(runId);

  // 批次执行状态（带智能轮询）
  const batchExecution = useBatchExecution(runId, {
    enableSmartPolling: options?.enableSmartPolling,
    onStatusChange: (status, prevStatus) => {
      options?.onStatusChange?.(status, prevStatus);

      // 检测执行完成
      if (prevStatus && ['running', 'pending'].includes(prevStatus) &&
          ['success', 'failed', 'aborted'].includes(status)) {
        options?.onExecutionComplete?.(batchExecution.data!);
      }
    },
    onSyncIssue: (issue) => {
      setSyncIssues(prev => [...prev, `${new Date().toLocaleTimeString()}: ${issue}`]);
      options?.onSyncIssue?.(issue);
    }
  });

  const handleExecuteCase = useCallback(
    async (caseId: number, projectId: number) => {
      try {
        setError(null);
        setSyncIssues([]);
        const result = await executeCase.mutateAsync({ caseId, projectId });
        setRunId(result.runId);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '执行失败';
        setError(message);
        throw err;
      }
    },
    [executeCase.mutateAsync]
  );

  const handleExecuteBatch = useCallback(
    async (caseIds: number[], projectId: number) => {
      try {
        setError(null);
        setSyncIssues([]);
        const result = await executeBatch.mutateAsync({ caseIds, projectId });
        setRunId(result.runId);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '批量执行失败';
        setError(message);
        throw err;
      }
    },
    [executeBatch.mutateAsync]
  );

  const handleManualSync = useCallback(async () => {
    if (!runId) return;

    try {
      const result = await manualSync.mutateAsync(runId);

      // 手动同步成功后，刷新批次状态
      batchExecution.refetch();
      monitoringStatus.refetch();

      // 清除同步问题（如果同步成功）
      if (result.success && (result as any).updated) {
        setSyncIssues([]);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '手动同步失败';
      setSyncIssues(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
      throw err;
    }
  }, [runId, manualSync.mutateAsync, batchExecution.refetch, monitoringStatus.refetch]);

  const reset = useCallback(() => {
    setRunId(null);
    setError(null);
    setSyncIssues([]);
  }, []);

  // 检测同步异常
  const hasSyncIssues = syncIssues.length > 0 ||
    (monitoringStatus.data?.syncStatus?.status === 'failed') ||
    (monitoringStatus.data?.syncStatus?.status === 'timeout');

  // 检测长时间运行
  const isLongRunning = batchExecution.data &&
    batchExecution.data.start_time &&
    ['running', 'pending'].includes(batchExecution.data.status) &&
    (Date.now() - new Date(batchExecution.data.start_time).getTime()) > 5 * 60 * 1000; // 超过5分钟

  return {
    // 执行状态
    runId,
    error,
    isExecuting: executeCase.isPending || executeBatch.isPending,

    // 批次信息
    batchInfo: batchExecution.data,
    isFetchingBatch: batchExecution.isFetching,
    batchError: batchExecution.error,

    // 监控状态
    monitoringStatus: monitoringStatus.data,
    isMonitoring: monitoringStatus.data?.isMonitoring || false,
    syncStatus: monitoringStatus.data?.syncStatus,

    // 同步状态
    syncIssues,
    hasSyncIssues,
    isLongRunning,
    canManualSync: !!runId && !manualSync.isPending,

    // 执行函数
    executeCase: handleExecuteCase,
    executeBatch: handleExecuteBatch,
    manualSync: handleManualSync,
    reset,

    // 状态检查
    isManualSyncing: manualSync.isPending,
    manualSyncError: manualSync.error,
  };
}

/**
 * 执行状态监控面板 hook
 * 提供监控统计和系统健康状态
 */
export function useExecutionMonitoring() {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  // 获取监控统计
  const monitoringStats = useQuery({
    queryKey: ['monitoring-stats'],
    queryFn: async () => {
      const response = await fetch('/api/monitoring/stats');
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '获取监控统计失败');
      }
      return result.data;
    },
    refetchInterval: 30000, // 30秒刷新一次
    staleTime: 20000,
  });

  // 获取活跃监控列表
  const activeMonitoring = useQuery({
    queryKey: ['active-monitoring'],
    queryFn: async () => {
      const response = await fetch('/api/monitoring/active');
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '获取活跃监控失败');
      }
      return result.data;
    },
    refetchInterval: 15000, // 15秒刷新一次
    staleTime: 10000,
  });

  // 健康检查
  const healthCheck = useQuery({
    queryKey: ['monitoring-health'],
    queryFn: async () => {
      const response = await fetch('/api/monitoring/health');
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '健康检查失败');
      }
      return result.data;
    },
    refetchInterval: 60000, // 1分钟检查一次
    staleTime: 45000,
  });

  return {
    // 统计数据
    stats: monitoringStats.data,
    activeList: activeMonitoring.data,
    health: healthCheck.data,

    // 加载状态
    isLoadingStats: monitoringStats.isLoading,
    isLoadingActive: activeMonitoring.isLoading,
    isLoadingHealth: healthCheck.isLoading,

    // 错误状态
    statsError: monitoringStats.error,
    activeError: activeMonitoring.error,
    healthError: healthCheck.error,

    // 选中状态
    selectedRunId,
    setSelectedRunId,

    // 刷新函数
    refreshStats: monitoringStats.refetch,
    refreshActive: activeMonitoring.refetch,
    refreshHealth: healthCheck.refetch,
  };
}