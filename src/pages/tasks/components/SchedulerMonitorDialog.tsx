import { Activity, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useSchedulerStatus } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { getErrorMessage } from './taskPageConfig';

export function SchedulerMonitorDialog({ onClose }: { onClose: () => void }) {
  const { data: status, isLoading, error, refetch } = useSchedulerStatus();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            调度器实时状态
          </DialogTitle>
          <DialogDescription>
            每 10 秒自动刷新 · 显示运行中、排队及已计划任务
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 max-h-[68vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 py-4">
            <AlertCircle className="h-5 w-5" />
            <span>加载失败：{getErrorMessage(error)}</span>
          </div>
        ) : status ? (
          <div className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            {/* 并发状态概览 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{status.running.length}</p>
                <p className="text-xs text-slate-500 mt-1">运行中</p>
                <p className="text-xs text-blue-400 mt-0.5">上限 {status.concurrencyLimit}</p>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {(status.queueDepth ?? status.queued.length) + (status.directQueueDepth ?? status.directQueued.length)}
                </p>
                <p className="text-xs text-slate-500 mt-1">等待队列</p>
                {status.maxQueueDepth && (
                  <p className="text-xs text-amber-400 mt-0.5">上限 {status.maxQueueDepth}</p>
                )}
              </div>
              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{status.scheduled.length}</p>
                <p className="text-xs text-slate-500 mt-1">已计划</p>
              </div>
            </div>

            {/* 并发使用率进度条 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>并发使用率</span>
                <span>{status.running.length} / {status.concurrencyLimit}</span>
              </div>
              <Progress
                value={Math.min(100, (status.running.length / Math.max(1, status.concurrencyLimit)) * 100)}
                className={cn(
                  'h-2 w-full',
                  status.running.length >= status.concurrencyLimit
                    ? '[&>div]:bg-red-500'
                    : status.running.length >= status.concurrencyLimit * 0.7
                    ? '[&>div]:bg-amber-400'
                    : '[&>div]:bg-blue-500'
                )}
                aria-label={`并发使用率 ${status.running.length} / ${status.concurrencyLimit}`}
              />
            </div>

            {/* 运行中的任务（P1：显示 taskId + runId + 已运行时长） */}
            {status.running.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
                  运行中 ({status.running.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {status.running.map((slot) => {
                    const elapsedSec = Math.round((slot.elapsedMs ?? 0) / 1000);
                    const elapsedDisplay = elapsedSec >= 60
                      ? `${Math.floor(elapsedSec / 60)}m${elapsedSec % 60}s`
                      : `${elapsedSec}s`;
                    return (
                      <div key={slot.runId ?? slot.taskId} className="flex items-center justify-between px-2 py-1 rounded-md text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono">
                        <span>Task #{slot.taskId}</span>
                        <span className="text-blue-400 ml-2">Run #{slot.runId}</span>
                        <span className="text-blue-500 ml-auto">{elapsedDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 等待队列（P1：显示优先级、等待时长、触发方式） */}
            {status.queued.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  等待队列 ({status.queued.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {status.queued.map((item) => {
                    const waitSec = Math.round((item.waitMs ?? 0) / 1000);
                    const waitDisplay = waitSec >= 60
                      ? `${Math.floor(waitSec / 60)}m${waitSec % 60}s`
                      : `${waitSec}s`;
                    const triggerLabel = item.triggerReason === 'manual' ? '手动' : item.triggerReason === 'retry' ? '重试' : '定时';
                    return (
                      <div key={`${item.taskId}-${item.queuePosition}`} className="flex items-center gap-2 px-2 py-1 rounded-md text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-mono">
                        <span className="text-amber-400 font-bold w-5">#{item.queuePosition}</span>
                        <span>Task #{item.taskId}</span>
                        <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-800/30 text-amber-600">{triggerLabel}</span>
                        <span className="ml-auto text-amber-400">等待 {waitDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 直连等待队列（run-case / run-batch） */}
            {status.directQueued.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                  直连等待队列 ({status.directQueued.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {status.directQueued.map((item) => {
                    const waitSec = Math.round((item.waitMs ?? 0) / 1000);
                    const waitDisplay = waitSec >= 60
                      ? `${Math.floor(waitSec / 60)}m${waitSec % 60}s`
                      : `${waitSec}s`;
                    return (
                      <div key={`${item.label}-${item.queuePosition}`} className="flex items-center gap-2 px-2 py-1 rounded-md text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-mono">
                        <span className="text-violet-400 font-bold w-5">#{item.queuePosition}</span>
                        <span className="truncate">{item.label}</span>
                        <span className="ml-auto text-violet-400">等待 {waitDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 已计划的任务 */}
            {status.scheduled.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  已计划定时触发 ({status.scheduled.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {status.scheduled.map((id) => (
                    <span key={id} className="px-2 py-1 rounded-md text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-mono">
                      Task #{id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {status.running.length === 0 && status.queued.length === 0 && status.directQueued.length === 0 && (
              <div className="text-center py-4 text-slate-400">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">调度器空闲，无任务运行</p>
              </div>
            )}
          </div>
        ) : null}
        </div>

        <DialogFooter className="gap-2 px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
