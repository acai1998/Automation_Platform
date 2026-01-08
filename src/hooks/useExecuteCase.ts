import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

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
      const response = await fetch('/api/jenkins/run-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '执行失败');
      }
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
      const response = await fetch('/api/jenkins/run-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '批量执行失败');
      }
      return result.data as ExecuteResult;
    },
  });
}

/**
 * 获取执行批次详情（含轮询功能）
 */
export function useBatchExecution(runId: number | null, pollInterval: number = 3000) {
  return useQuery({
    queryKey: ['batch-execution', runId],
    queryFn: async () => {
      if (!runId) return null;
      const response = await fetch(`/api/jenkins/batch/${runId}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '获取执行详情失败');
      }
      return result.data as BatchExecution;
    },
    enabled: !!runId,
    refetchInterval: (data) => {
      // 当状态为运行中时，继续轮询；否则停止
      if (data?.status === 'running' || data?.status === 'pending') {
        return pollInterval;
      }
      return false;
    },
    staleTime: 0, // 不缓存
  });
}

/**
 * 完整的执行管理 hook
 */
export function useTestExecution() {
  const [runId, setRunId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeCase = useExecuteCase();
  const executeBatch = useExecuteBatch();
  const batchExecution = useBatchExecution(runId);

  const handleExecuteCase = useCallback(
    async (caseId: number, projectId: number) => {
      try {
        setError(null);
        const result = await executeCase.mutateAsync({ caseId, projectId });
        setRunId(result.runId);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '执行失败';
        setError(message);
        throw err;
      }
    },
    [executeCase]
  );

  const handleExecuteBatch = useCallback(
    async (caseIds: number[], projectId: number) => {
      try {
        setError(null);
        const result = await executeBatch.mutateAsync({ caseIds, projectId });
        setRunId(result.runId);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '批量执行失败';
        setError(message);
        throw err;
      }
    },
    [executeBatch]
  );

  const reset = useCallback(() => {
    setRunId(null);
    setError(null);
  }, []);

  return {
    // 执行状态
    runId,
    error,
    isExecuting: executeCase.isPending || executeBatch.isPending,

    // 批次信息
    batchInfo: batchExecution.data,
    isFetchingBatch: batchExecution.isFetching,
    batchError: batchExecution.error,

    // 执行函数
    executeCase: handleExecuteCase,
    executeBatch: handleExecuteBatch,
    reset,
  };
}