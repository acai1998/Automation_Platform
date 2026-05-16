import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  Clock,
  ListOrdered,
  Loader2,
  TrendingUp,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { useTaskAuditLogs, useTaskStats, type Task } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { getErrorMessage } from './taskPageConfig';

const AUDIT_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: '创建任务', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  updated: { label: '更新任务', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  deleted: { label: '删除任务', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  status_changed: { label: '状态变更', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  manually_triggered: { label: '手动触发', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  execution_cancelled: { label: '取消执行', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  compensated: { label: '漏触补偿', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  triggered: { label: '调度触发', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  retry_scheduled: { label: '重试排队', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  permanently_failed: { label: '彻底失败', color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
};

type StatsTab = 'stats' | 'audit';

export function TaskStatsDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<StatsTab>('stats');
  const { data: stats, isLoading: statsLoading, error: statsError } = useTaskStats(task.id, 30);
  const { data: auditData, isLoading: auditLoading } = useTaskAuditLogs(task.id, 50, 0);

  const successRateColor = (rate: number) =>
    rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-orange-500' : 'text-red-500';

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 animate-in fade-in-0 zoom-in-95 duration-200">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-blue-500" />
            {task.name}
          </DialogTitle>
          <DialogDescription>
            执行统计与操作审计
          </DialogDescription>
        </DialogHeader>

        {/* 标签页切换 */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 px-4">
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
            onClick={() => setActiveTab('stats')}
          >
            <TrendingUp className="h-4 w-4" />
            执行统计（近30天）
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
            onClick={() => setActiveTab('audit')}
          >
            <ListOrdered className="h-4 w-4" />
            操作审计
            {auditData && auditData.total > 0 && (
              <span className="ml-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full">
                {auditData.total}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ─── 执行统计标签页 ─── */}
          {activeTab === 'stats' && (
            <div className="">
              {statsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : statsError ? (
                <div className="flex items-center gap-2 text-red-600 py-4">
                  <AlertCircle className="h-5 w-5" />
                  <span>加载失败：{getErrorMessage(statsError)}</span>
                </div>
              ) : stats ? (
                <div className="space-y-6">
                  {/* 摘要卡片 */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-center">
                      <p className="text-2xl font-bold">{stats.summary.total}</p>
                      <p className="text-xs text-slate-500 mt-1">总执行次数</p>
                    </div>
                    <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 text-center">
                      <p className={`text-2xl font-bold ${successRateColor(stats.summary.successRate)}`}>
                        {stats.summary.successRate}%
                      </p>
                      <p className="text-xs text-slate-500 mt-1">成功率</p>
                    </div>
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{stats.summary.failedCount}</p>
                      <p className="text-xs text-slate-500 mt-1">失败次数</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {stats.summary.avgDurationSec > 0 ? `${stats.summary.avgDurationSec}s` : '-'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">平均耗时</p>
                    </div>
                  </div>

                  {/* 每日成功率趋势 */}
                  {stats.trend.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                        每日成功率趋势
                      </h4>
                      <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                        {stats.trend.map((item) => (
                          <div key={item.day} className="flex items-center gap-3 text-sm">
                            <span className="w-24 shrink-0 text-slate-500 text-xs">{item.day}</span>
                            <Progress
                              value={Math.max(2, item.successRate)}
                              className={cn(
                                'h-2 flex-1',
                                item.successRate >= 80
                                  ? '[&>div]:bg-green-500'
                                  : item.successRate >= 50
                                  ? '[&>div]:bg-orange-400'
                                  : '[&>div]:bg-red-400'
                              )}
                              aria-label={`${item.day} 成功率 ${item.successRate}%`}
                            />
                            <span className={cn('w-10 text-right font-bold text-xs shrink-0', successRateColor(item.successRate))}>
                              {item.successRate}%
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{item.total}次</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top 10 失败原因 */}
                  {stats.topErrors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        高频失败原因 TOP 10
                      </h4>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                        {stats.topErrors.map((err, idx) => (
                          <div key={idx} className="flex items-start gap-3 text-xs rounded-lg p-2 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                            <span className="font-bold text-red-500 shrink-0 w-4">{idx + 1}</span>
                            <span className="flex-1 text-slate-700 dark:text-slate-300 break-all line-clamp-2">
                              {err.errorMessage}
                            </span>
                            <Badge variant="secondary" className="shrink-0 text-xs bg-red-100 dark:bg-red-900/30 text-red-600">
                              {err.count}次
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats.trend.length === 0 && stats.topErrors.length === 0 && (
                    <div className="text-center py-6 text-slate-400">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>近 30 天内暂无运行记录</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* ─── 审计日志标签页 ─── */}
          {activeTab === 'audit' && (
            <div className="">
              {auditLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : !auditData || auditData.data.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <ListOrdered className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>暂无操作记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">
                    共 {auditData.total} 条操作记录（显示最近 50 条）
                  </p>
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {auditData.data.map((entry) => {
                      const actionConfig = AUDIT_ACTION_LABELS[entry.action] ?? {
                        label: entry.action,
                        color: 'bg-slate-100 text-slate-600',
                      };
                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* 操作类型标签 */}
                          <span className={cn(
                            'shrink-0 text-xs px-2 py-1 rounded-full font-medium',
                            actionConfig.color
                          )}>
                            {actionConfig.label}
                          </span>

                          {/* 元数据摘要 */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                              {JSON.stringify(entry.metadata) === '{}' ? '（无附加信息）' : (
                                Object.entries(entry.metadata)
                                  .slice(0, 3)
                                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                                  .join(' · ')
                              )}
                            </p>
                          </div>

                          {/* 操作者 + 时间 */}
                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                              <User className="h-3 w-3" />
                              {entry.operatorName ?? (entry.operatorId != null ? `#${entry.operatorId}` : '系统')}
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                              <Clock className="h-3 w-3" />
                              {entry.createdAt
                                ? new Date(entry.createdAt).toLocaleString('zh-CN', {
                                    month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit',
                                  })
                                : '-'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-6 py-3 bg-slate-50/80 dark:bg-slate-900/60">
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
