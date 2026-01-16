import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader } from 'lucide-react';

interface ExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  caseCount: number;
  isLoading?: boolean;
  error?: string | null;
}

export function ExecutionModal({
  isOpen,
  onClose,
  onConfirm,
  caseCount,
  isLoading = false,
  error,
}: ExecutionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认执行</DialogTitle>
          <DialogDescription>
            您确定要执行选中的 {caseCount} 个用例吗？
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 错误提示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 用例信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-blue-700">
              <strong>即将执行 {caseCount} 个用例</strong>
              <br />
              执行过程可能需要几分钟，请耐心等待...
            </p>
          </div>

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader className="w-4 h-4 animate-spin" />
              <span>正在准备，请稍候...</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting || isLoading}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoading || caseCount === 0}
          >
            {isSubmitting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                提交中...
              </>
            ) : (
              '确认执行'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}