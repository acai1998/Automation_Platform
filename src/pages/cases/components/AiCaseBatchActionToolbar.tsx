import { type ReactNode } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  PauseCircle,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import type { AiCaseNodeStatus } from '@/types/aiCases';

interface StatusAction {
  status: AiCaseNodeStatus;
  label: string;
  icon: ReactNode;
  activeClass: string;
  idleClass: string;
}

const STATUS_ACTIONS: StatusAction[] = [
  {
    status: 'todo',
    label: '待执行',
    icon: <Circle className="h-3.5 w-3.5" />,
    activeClass:
      'border-slate-400 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200',
    idleClass:
      'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
  },
  {
    status: 'doing',
    label: '执行中',
    icon: <Clock3 className="h-3.5 w-3.5" />,
    activeClass:
      'border-blue-400 bg-blue-100 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300',
    idleClass:
      'border-slate-200 text-slate-600 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-blue-900/20',
  },
  {
    status: 'blocked',
    label: '阻塞',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    activeClass:
      'border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-300',
    idleClass:
      'border-slate-200 text-slate-600 hover:bg-amber-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-amber-900/20',
  },
  {
    status: 'passed',
    label: '通过',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    activeClass:
      'border-emerald-400 bg-emerald-100 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300',
    idleClass:
      'border-slate-200 text-slate-600 hover:bg-emerald-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-emerald-900/20',
  },
  {
    status: 'failed',
    label: '失败',
    icon: <XCircle className="h-3.5 w-3.5" />,
    activeClass:
      'border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-900/30 dark:text-rose-300',
    idleClass:
      'border-slate-200 text-slate-600 hover:bg-rose-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-900/20',
  },
  {
    status: 'skipped',
    label: '跳过',
    icon: <PauseCircle className="h-3.5 w-3.5" />,
    activeClass:
      'border-purple-400 bg-purple-100 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300',
    idleClass:
      'border-slate-200 text-slate-600 hover:bg-purple-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-purple-900/20',
  },
];

export interface AiCaseBatchActionToolbarProps {
  /** 是否显示浮层（selectedNodeIds 非空时为 true） */
  visible: boolean;
  /** 实际将操作的 testcase 节点数量 */
  targetCount: number;
  /** 操作进行中（禁用按钮） */
  isUpdating: boolean;
  /** 点击状态按钮的回调 */
  onStatusChange: (status: AiCaseNodeStatus) => void;
  /** 点击关闭按钮，取消选中节点 */
  onDismiss: () => void;
}

/**
 * 画布内浮层批量操作工具栏。
 * 当用户在 XMind 画布上选中节点（单选/多选）时显示，
 * 提供 6 个状态切换按钮，支持批量修改测试点状态。
 */
export function AiCaseBatchActionToolbar({
  visible,
  targetCount,
  isUpdating,
  onStatusChange,
  onDismiss,
}: AiCaseBatchActionToolbarProps) {
  const hasTargets = targetCount > 0;

  return (
    <div
      className={`
        absolute bottom-4 right-4 z-30
        w-56
        rounded-xl border border-slate-200 dark:border-slate-700
        bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm
        shadow-xl shadow-slate-900/10
        transition-all duration-200 ease-out
        ${visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-2 pointer-events-none'
        }
      `}
      role="toolbar"
      aria-label="批量操作测试点"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          {isUpdating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
          )}
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {isUpdating ? '批量更新中...' : '批量操作'}
          </span>
          {hasTargets && !isUpdating && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-bold text-white">
              {targetCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="关闭批量操作工具栏"
          className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="p-2.5">
        {!hasTargets ? (
          <p className="text-center text-[11px] text-slate-400 py-1 px-1">
            所选节点无测试点，无法操作
          </p>
        ) : (
          <>
            <p className="text-[10px] text-slate-400 mb-2 text-center">
              将
              <span className="font-semibold text-slate-600 dark:text-slate-300 mx-0.5">
                {targetCount}
              </span>
              个测试点状态设为
            </p>
            <div className="grid grid-cols-3 gap-1">
              {STATUS_ACTIONS.map((item) => {
                const isDisabled = isUpdating;
                return (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() => void onStatusChange(item.status)}
                    disabled={isDisabled}
                    className={`
                      h-8 rounded-md border text-xs font-medium
                      flex flex-col items-center justify-center gap-0.5
                      transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed
                      ${item.idleClass}
                    `}
                  >
                    {item.icon}
                    <span className="text-[10px] leading-none">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
