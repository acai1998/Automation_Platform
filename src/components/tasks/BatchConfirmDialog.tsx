import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Task } from '@/hooks/useTasks';

interface BatchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'activate' | 'pause' | 'delete' | 'run';
  tasks: Task[];
  onConfirm: () => Promise<{ successes: number; failures: number }>;
}

/**
 * 批量操作确认对话框
 *
 * 显示即将被批量操作的任务列表，并在操作过程中显示进度
 * 操作完成后显示成功/失败的统计结果
 */
export function BatchConfirmDialog({
  open,
  onOpenChange,
  action,
  tasks,
  onConfirm,
}: BatchConfirmDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ successes: number; failures: number } | null>(null);

  const actionLabels = {
    activate: '启用',
    pause: '暂停',
    delete: '删除',
    run: '运行',
  };

  const actionLabel = actionLabels[action];
  const isDestructive = action === 'delete';

  const handleConfirm = async () => {
    setIsProcessing(true);

    try {
      const opResult = await onConfirm();
      setResult(opResult);
    } catch (error) {
      console.error('Batch operation failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      onOpenChange(false);
      // 重置状态（延迟以等待关闭动画完成）
      setTimeout(() => {
        setResult(null);
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDestructive && <AlertTriangle className="h-5 w-5 text-red-500" />}
            批量{actionLabel}任务
          </DialogTitle>
          <DialogDescription>
            {!result && (
              <>
                确定要{actionLabel} <strong>{tasks.length}</strong> 个任务吗？
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 任务列表预览 */}
        {!result && !isProcessing && (
          <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-1 bg-slate-50 dark:bg-slate-900">
            {tasks.slice(0, 10).map(task => (
              <div key={task.id} className="text-sm text-slate-600 dark:text-slate-400">
                • {task.name}
              </div>
            ))}
            {tasks.length > 10 && (
              <div className="text-sm text-slate-400 dark:text-slate-500 italic">
                还有 {tasks.length - 10} 个任务...
              </div>
            )}
          </div>
        )}

        {/* 处理中不确定态动画 */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              正在{actionLabel}，请稍候...
            </p>
          </div>
        )}

        {/* 结果汇总 */}
        {result && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">成功: {result.successes} 个</span>
            </div>
            {result.failures > 0 && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">失败: {result.failures} 个</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                取消
              </Button>
              <Button
                variant={isDestructive ? 'destructive' : 'default'}
                onClick={handleConfirm}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    处理中...
                  </>
                ) : `确认${actionLabel}`}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
