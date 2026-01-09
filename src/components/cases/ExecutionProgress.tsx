import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, Loader } from 'lucide-react';
import type { BatchExecution } from '@/hooks/useExecuteCase';

interface ExecutionProgressProps {
  isOpen: boolean;
  onClose: () => void;
  batchInfo: BatchExecution | undefined;
  isLoading: boolean;
  error: Error | null;
  buildUrl?: string;
}

export function ExecutionProgress({
  isOpen,
  onClose,
  batchInfo,
  isLoading,
  error,
  buildUrl,
}: ExecutionProgressProps) {
  if (!isOpen) return null;

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-12 h-12 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-12 h-12 text-red-500" />;
      case 'running':
        return <Loader className="w-12 h-12 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-12 h-12 text-gray-500" />;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'running':
        return '执行中';
      case 'success':
        return '成功';
      case 'failed':
        return '失败';
      case 'aborted':
        return '已中止';
      default:
        return '未知';
    }
  };

  const successRate = batchInfo?.total_cases
    ? Math.round((batchInfo.passed_cases / batchInfo.total_cases) * 100)
    : 0;

  const durationSeconds = batchInfo?.duration_ms ? (batchInfo.duration_ms / 1000).toFixed(2) : '0';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>执行进度</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 错误信息 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error.message}
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && !batchInfo && (
            <div className="flex justify-center py-8">
              <Loader className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}

          {/* 执行信息 */}
          {batchInfo && (
            <>
              {/* 状态展示 */}
              <div className="flex justify-center py-4">
                <div className="flex flex-col items-center">
                  {getStatusIcon(batchInfo.status)}
                  <p className="mt-2 text-lg font-semibold">{getStatusText(batchInfo.status)}</p>
                </div>
              </div>

              {/* 统计数据 */}
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{batchInfo.total_cases}</p>
                    <p className="text-sm text-gray-600">总用例数</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{batchInfo.passed_cases}</p>
                    <p className="text-sm text-gray-600">通过</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{batchInfo.failed_cases}</p>
                    <p className="text-sm text-gray-600">失败</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{batchInfo.skipped_cases}</p>
                    <p className="text-sm text-gray-600">跳过</p>
                  </div>
                </div>
              </Card>

              {/* 进度条 */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>成功率</span>
                  <span className="font-semibold">{successRate}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${successRate}%` }}
                  />
                </div>
              </div>

              {/* 执行时间 */}
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">开始时间:</span>
                  <span>{batchInfo.start_time || '-'}</span>
                </div>
                {batchInfo.end_time && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">结束时间:</span>
                    <span>{batchInfo.end_time}</span>
                  </div>
                )}
                {batchInfo.duration_ms && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">耗时:</span>
                    <span>{durationSeconds}秒</span>
                  </div>
                )}
              </div>

              {/* Jenkins 链接 */}
              {buildUrl && (
                <div>
                  <a
                    href={buildUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    查看 Jenkins 构建详情 →
                  </a>
                </div>
              )}
            </>
          )}

          {/* 底部按钮 */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              {batchInfo?.status === 'running' ? '继续监听' : '关闭'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}