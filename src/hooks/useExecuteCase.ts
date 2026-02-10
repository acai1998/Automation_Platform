import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../api';
import { wsClient } from '../services/websocket';
import {
  POLLING_CONFIG,
  calculatePollingInterval,
  checkStuckStatus,
  getStuckMessage,
} from '../config/polling';

/**
 * Legacy polling constants (deprecated - use POLLING_CONFIG instead)
 * Kept for backward compatibility
 * @deprecated Use POLLING_CONFIG from '../config/polling' instead
 */
const POLLING_CONSTANTS = {
  FAST_INTERVAL: POLLING_CONFIG.INTERVALS.FAST,
  NORMAL_INTERVAL: POLLING_CONFIG.INTERVALS.NORMAL,
  MEDIUM_INTERVAL: POLLING_CONFIG.INTERVALS.MEDIUM,
  SLOW_INTERVAL: POLLING_CONFIG.INTERVALS.SLOW,
  MAX_EXECUTION_TIME: POLLING_CONFIG.WINDOWS.MAX_EXECUTION_TIME,
  STUCK_DETECTION_TIME: POLLING_CONFIG.STUCK_DETECTION.CRITICAL_THRESHOLD,
  PENDING_FAST_POLL_WINDOW: POLLING_CONFIG.WINDOWS.PENDING_FAST_POLL,
  EARLY_EXECUTION_WINDOW: POLLING_CONFIG.WINDOWS.EARLY_EXECUTION,
  MID_EXECUTION_WINDOW: POLLING_CONFIG.WINDOWS.MID_EXECUTION,
} as const;

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

export interface ManualSyncResult {
  success: boolean;
  data?: {
    updated: boolean;
    message: string;
    currentStatus?: string;
    jenkinsStatus?: string;
    executionId: number;
  };
  message?: string;
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
 * 手动同步执行状态
 */
export function useManualSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (executionId: number) => {
      const result = await request<ManualSyncResult>(`/executions/${executionId}/sync`, {
        method: 'POST',
      });
      return result.data as ManualSyncResult;
    },
    onSuccess: (data, executionId) => {
      // 如果同步成功，立即刷新批次执行数据
      if (data.success && data.data?.updated) {
        queryClient.invalidateQueries({
          queryKey: ['batch-execution', executionId]
        });
      }
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

  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | null>(null);
  const lastSyncAttemptRef = useRef<number>(0);
  const stuckDetectionRef = useRef<number>(0);
  const [wsConnected, setWsConnected] = useState(false);

  // WebSocket 订阅
  useEffect(() => {
    if (!runId) return;

    const isConnected = wsClient.isConnected();
    setWsConnected(isConnected);

    if (!isConnected) {
      console.log('[WebSocket] Not connected, using polling fallback');
      return;
    }

    console.log('[WebSocket] Subscribing to execution updates for runId:', runId);

    // 订阅 WebSocket 更新
    const unsubscribe = wsClient.subscribeToExecution(runId, {
      onUpdate: (data) => {
        console.log('[WebSocket] Execution update received:', data);

        // 立即更新缓存
        queryClient.setQueryData(['batch-execution', runId], (old: any) => {
          if (!old) return old;

          return {
            ...old,
            status: data.status,
            passedCases: data.passedCases ?? old.passedCases,
            failedCases: data.failedCases ?? old.failedCases,
            skippedCases: data.skippedCases ?? old.skippedCases,
            durationMs: data.durationMs ?? old.durationMs
          };
        });

        // 触发状态变化回调
        if (prevStatusRef.current !== data.status) {
          onStatusChange?.(data.status, prevStatusRef.current || undefined);
          prevStatusRef.current = data.status;
        }
      },
      onQuickFail: (data) => {
        console.warn('[WebSocket] Quick fail detected:', data);
        onSyncIssue?.(`Quick fail: ${data.message} (${data.duration}ms)`);
      }
    });

    return unsubscribe;
  }, [runId, queryClient, onStatusChange, onSyncIssue]);

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

      const status = data.status;

      // Check if execution is completed
      if (['success', 'failed', 'aborted'].includes(status)) {
        console.log(`[Polling] Execution completed with status: ${status}, stopping polling`);
        return false;
      }

      // Continue polling for pending and running states
      if (status === 'pending' || status === 'running') {
        // Use centralized polling interval calculation
        const interval = calculatePollingInterval(status, data.start_time, wsConnected);

        if (interval === false) {
          console.log('[Polling] Max execution time reached, stopping polling');
          return false;
        }

        // Log polling strategy
        if (wsConnected) {
          console.log('[Polling] WebSocket connected, using backup polling (60 seconds)');
        } else if (enableSmartPolling) {
          const elapsedTime = data.start_time
            ? Date.now() - new Date(data.start_time).getTime()
            : 0;
          console.log(`[Polling] Smart polling: ${interval}ms (elapsed: ${Math.round(elapsedTime / 1000)}s)`);
        }

        return interval;
      }

      return false;
    },
    staleTime: 0, // 禁用缓存以获得最新数据
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Handle status change side effects
  useEffect(() => {
    const data = query.data;
    if (data && prevStatusRef.current && prevStatusRef.current !== data.status) {
      onStatusChange?.(data.status, prevStatusRef.current);
    }
    if (data) {
      prevStatusRef.current = data.status;

      // Check for stuck execution using centralized helper
      const stuckStatus = checkStuckStatus(data.status, data.start_time);

      if (stuckStatus.isStuck) {
        const now = Date.now();
        // Alert cooldown: only alert once per minute
        if (now - stuckDetectionRef.current > POLLING_CONFIG.STUCK_DETECTION.ALERT_COOLDOWN) {
          stuckDetectionRef.current = now;
          const message = getStuckMessage(stuckStatus.severity, stuckStatus.elapsedTime);
          onSyncIssue?.(message);
        }
      }
    }

    // Cleanup: reset detection state when execution completes
    return () => {
      if (!query.data || ['success', 'failed', 'aborted'].includes(query.data.status)) {
        stuckDetectionRef.current = 0;
        lastSyncAttemptRef.current = 0;
      }
    };
  }, [query.data, onStatusChange, onSyncIssue]);

  // Calculate stuck status using centralized helper
  const stuckStatus = query.data
    ? checkStuckStatus(query.data.status, query.data.start_time)
    : { isStuck: false, isEarlyStuck: false, isCriticallyStuck: false, elapsedTime: 0, severity: 'none' as const };

  return {
    ...query,
    // WebSocket connection status
    wsConnected,
    // Stuck detection status
    isStuck: stuckStatus.isCriticallyStuck,
    isPotentiallyStuck: stuckStatus.isEarlyStuck,
    isEarlyStuck: stuckStatus.isEarlyStuck,
    isCriticallyStuck: stuckStatus.isCriticallyStuck,
    stuckSeverity: stuckStatus.severity,
    executionDuration: stuckStatus.elapsedTime,
  };
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
  const [lastManualSync, setLastManualSync] = useState<number | null>(null);

  const executeCase = useExecuteCase();
  const executeBatch = useExecuteBatch();
  const manualSync = useManualSync();

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

  // 手动同步状态
  const handleManualSync = useCallback(async () => {
    if (!runId) return;

    try {
      setError(null);
      const result = await manualSync.mutateAsync(runId);
      setLastManualSync(Date.now());

      if (result.success && result.data) {
        const message = result.data.updated
          ? `Status synced successfully: ${result.data.currentStatus} → ${result.data.jenkinsStatus}`
          : `Status already up to date: ${result.data.currentStatus}`;

        setSyncIssues(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
      } else {
        setSyncIssues(prev => [...prev, `${new Date().toLocaleTimeString()}: Sync failed - ${result.message}`]);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Manual sync failed';
      setError(message);
      setSyncIssues(prev => [...prev, `${new Date().toLocaleTimeString()}: Error - ${message}`]);
      throw err;
    }
  }, [runId, manualSync.mutateAsync]);

  const reset = useCallback(() => {
    setRunId(null);
    setError(null);
    setSyncIssues([]);
    setLastManualSync(null);
  }, []);

  // Detect long-running execution using centralized config
  const isLongRunning = batchExecution.data
    ? checkStuckStatus(batchExecution.data.status, batchExecution.data.start_time).isCriticallyStuck
    : false;

  return {
    // 执行状态
    runId,
    error,
    isExecuting: executeCase.isPending || executeBatch.isPending,

    // 批次信息
    batchInfo: batchExecution.data,
    isFetchingBatch: batchExecution.isFetching,
    batchError: batchExecution.error,
    isStuck: batchExecution.isStuck,
    isPotentiallyStuck: batchExecution.isPotentiallyStuck,
    executionDuration: batchExecution.executionDuration,

    // 同步状态
    syncIssues,
    isLongRunning,
    lastManualSync,
    isSyncing: manualSync.isPending,

    // 执行函数
    executeCase: handleExecuteCase,
    executeBatch: handleExecuteBatch,
    manualSync: handleManualSync,
    reset,
  };
}
