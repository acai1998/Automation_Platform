import { Button } from '@/components/ui/button';
import { Play, Pause, Trash2, X } from 'lucide-react';

interface BatchActionBarProps {
  selectedCount: number;
  onActivate: () => void;
  onPause: () => void;
  onDelete: () => void;
  onRun?: () => void;
  onClear: () => void;
  isLoading?: boolean;
}

/**
 * 批量操作浮动工具栏
 *
 * 当用户选择了一个或多个任务时，在页面底部显示的固定工具栏
 * 提供批量启用、暂停、删除和运行等操作
 */
export function BatchActionBar({
  selectedCount,
  onActivate,
  onPause,
  onDelete,
  onRun,
  onClear,
  isLoading = false,
}: BatchActionBarProps) {
  // 如果没有选中任务，不显示工具栏
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white dark:bg-slate-900 shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* 左侧：选择信息 */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              已选择 <span className="text-blue-600 dark:text-blue-400 font-bold">{selectedCount}</span> 个任务
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={isLoading}
              className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <X className="h-4 w-4 mr-1" />
              清除选择
            </Button>
          </div>

          {/* 右侧：批量操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onActivate}
              disabled={isLoading}
              className="hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:hover:bg-green-900/20"
            >
              <Play className="h-4 w-4 mr-2" />
              批量启用
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onPause}
              disabled={isLoading}
              className="hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700 dark:hover:bg-yellow-900/20"
            >
              <Pause className="h-4 w-4 mr-2" />
              批量暂停
            </Button>

            {onRun && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRun}
                disabled={isLoading}
                className="hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-900/20"
              >
                <Play className="h-4 w-4 mr-2" />
                批量运行
              </Button>
            )}

            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              批量删除
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
