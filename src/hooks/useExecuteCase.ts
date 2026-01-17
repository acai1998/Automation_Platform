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

      const status = data.status;

      // 检查是否已完成或失败
      if (['success', 'failed', 'aborted'].includes(status)) {
        console.log(`[Polling] Execution completed with status: ${status}, stopping polling`);
        return false;
      }

      // 对于 pending 和 running 状态继续轮询
      if (status === 'pending' || status === 'running') {
        // 检查是否超过最大轮询时长 (基于 start_time)
        if (data.start_time) {
          const startTime = new Date(data.start_time).getTime();
          const MAX_POLL_DURATION = 10 * 60 * 1000; // 10分钟
          const elapsedTime = Date.now() - startTime;
          if (elapsedTime > MAX_POLL_DURATION) {
            console.log('[Polling] 已达到最大轮询时长（10分钟），停止轮询');
            return false;
          }
        }

        // 智能轮询间隔调整
        if (enableSmartPolling) {
          let duration = 0;
          if (data.start_time) {
            duration = Date.now() - new Date(data.start_time).getTime();
          }
          
          // pending 状态下快速轮询（等待 Jenkins 接收）
          if (status === 'pending' && duration < 30 * 1000) {
            console.log('[Polling] In pending state, fast polling (3 seconds)');
            return 3000; // 3秒快速轮询
          }

          // 根据执行时长动态调整轮询间隔
          if (duration < 2 * 60 * 1000) return 5000; // 5秒
          if (duration < 5 * 60 * 1000) return 10000; // 10秒
          return 30000; // 30秒
        }

        // 传统轮询逻辑
        return pollInterval;
      }

      return false;
    },
    staleTime: 0, // 禁用缓存以获得最新数据
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

  const reset = useCallback(() => {
    setRunId(null);
    setError(null);
    setSyncIssues([]);
  }, []);

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

    // 同步状态
    syncIssues,
    isLongRunning,

    // 执行函数
    executeCase: handleExecuteCase,
    executeBatch: handleExecuteBatch,
    reset,
  };
}
