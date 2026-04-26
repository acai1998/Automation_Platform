/**
 * 执行成功 Toast 组件（桌面端优化版）
 * 用于显示测试用例执行成功的提示，提供两个操作按钮
 */

import { CheckCircle2, ExternalLink, FileText, X } from 'lucide-react';
import { toast } from 'sonner';

interface ExecutionToastProps {
  /** Toast ID，用于关闭 */
  toastId: string | number;
  /** 执行批次 ID */
  runId: number;
  /** Jenkins 构建 URL（可选） */
  buildUrl?: string;
  /** 用例名称（可选，用于显示更多上下文） */
  caseName?: string;
  /** 是否是批量执行 */
  isBatch?: boolean;
  /** 批量执行的用例数量 */
  batchCount?: number;
}

/**
 * 执行成功 Toast 组件
 */
export function ExecutionSuccessToast({
  toastId,
  runId,
  buildUrl,
  caseName,
  isBatch = false,
  batchCount,
}: ExecutionToastProps) {
  const handleViewRecord = () => {
    window.location.href = `/reports/${runId}`;
    toast.dismiss(toastId);
  };

  const handleViewJenkins = () => {
    if (buildUrl) {
      window.open(buildUrl, '_blank', 'noopener,noreferrer');
      toast.dismiss(toastId);
    }
  };

  const handleDismiss = () => {
    toast.dismiss(toastId);
  };

  // 构建标题
  const title = isBatch
    ? `批量执行已开始 (${batchCount || 0} 个用例)`
    : '测试用例已开始执行';

  // 构建描述
  const description = '执行任务已创建，可通过以下方式查看进度';

  return (
    <div className="flex flex-col gap-2 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 w-[360px]">
      {/* 头部：图标 + 标题 + 关闭按钮 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* 成功图标 */}
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          </div>

          {/* 标题和描述 */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
              {description}
            </p>
            {/* 可选：显示用例名称（截断） */}
            {caseName && !isBatch && (
              <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate mt-0.5" title={caseName}>
                {caseName}
              </p>
            )}
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={handleDismiss}
          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="关闭提示"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 操作按钮区域 */}
      <div className="flex items-center gap-1.5 ml-7">
        {/* 查看记录按钮（主要操作） */}
        <button
          onClick={handleViewRecord}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded transition-colors shadow-sm"
        >
          <FileText className="w-3 h-3" />
          查看记录
        </button>

        {/* 查看 Jenkins 按钮（次要操作） */}
        {buildUrl && (
          <button
            onClick={handleViewJenkins}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            查看 Jenkins
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 显示执行成功 Toast 的辅助函数
 */
export function showExecutionSuccessToast(options: Omit<ExecutionToastProps, 'toastId'>) {
  return toast.custom(
    (t) => <ExecutionSuccessToast toastId={t} {...options} />,
    {
      duration: 6000,
      position: 'top-right',
    }
  );
}

/**
 * 执行失败 Toast 组件
 */
interface ExecutionErrorToastProps {
  toastId: string | number;
  message: string;
  description?: string;
  onRetry?: () => void;
}

export function ExecutionErrorToast({
  toastId,
  message,
  description = '请检查 Jenkins 连接或稍后重试',
  onRetry,
}: ExecutionErrorToastProps) {
  const handleDismiss = () => {
    toast.dismiss(toastId);
  };

  const handleRetry = () => {
    onRetry?.();
    toast.dismiss(toastId);
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-red-200 dark:border-red-900/50 w-[360px]">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* 错误图标 */}
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 shrink-0 mt-0.5">
            <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
          </div>

          {/* 标题和描述 */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-red-900 dark:text-red-400">
              {message}
            </h3>
            <p className="text-[11px] text-red-600 dark:text-red-500 leading-snug">
              {description}
            </p>
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={handleDismiss}
          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="关闭提示"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 操作按钮 */}
      {onRetry && (
        <div className="flex items-center gap-1.5 ml-7">
          <button
            onClick={handleRetry}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded transition-colors shadow-sm"
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 显示执行失败 Toast 的辅助函数
 */
export function showExecutionErrorToast(options: Omit<ExecutionErrorToastProps, 'toastId'>) {
  return toast.custom(
    (t) => <ExecutionErrorToast toastId={t} {...options} />,
    {
      duration: 5000,
      position: 'top-right',
    }
  );
}
