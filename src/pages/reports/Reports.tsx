import { useState } from 'react';
import { Link } from 'wouter';
import { 
  BarChart3, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  ExternalLink,
  FileText,
  History,
  Calendar,
  Filter,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTestRuns, TestRunFilters } from '@/hooks/useExecutions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * 报告中心页面
 * 采用与用例管理一致的现代化 SaaS Dashboard 风格
 * 数据读取自 Auto_TestRun 表
 */
export default function Reports() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 筛选状态
  const [filters, setFilters] = useState<TestRunFilters>({});
  // 时间选择器临时状态（用于 input 绑定，apply 时才更新 filters）
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

  // 获取运行记录
  const { data, isLoading, error, refetch } = useTestRuns(page, pageSize, filters);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, data?.total || 0);

  // 处理刷新
  const handleRefresh = () => {
    refetch();
    toast.success('数据已更新');
  };

  // 更新单个筛选项，同时重置到第一页
  const handleFilterChange = (key: keyof TestRunFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
    setPage(1);
  };

  // 应用时间范围筛选
  const handleDateApply = () => {
    if (startDateInput && endDateInput && startDateInput > endDateInput) {
      toast.error('开始日期不能晚于结束日期');
      return;
    }
    setFilters(prev => ({
      ...prev,
      startDate: startDateInput || undefined,
      endDate: endDateInput || undefined,
    }));
    setPage(1);
  };

  // 清空时间范围
  const handleDateClear = () => {
    setStartDateInput('');
    setEndDateInput('');
    setFilters(prev => ({ ...prev, startDate: undefined, endDate: undefined }));
    setPage(1);
  };

  // 清除所有筛选
  const handleClearAll = () => {
    setFilters({});
    setStartDateInput('');
    setEndDateInput('');
    setPage(1);
  };

  // 是否有活跃筛选
  const hasActiveFilters = !!(filters.triggerType || filters.status || filters.startDate || filters.endDate);

  // 状态主题配置
  const theme = {
    gradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 顶部标题区 - 带渐变背景 */}
      <div className={`relative h-20 px-4 sm:px-6 bg-gradient-to-r ${theme.gradient} dark:from-slate-800/50 dark:via-transparent rounded-t-xl flex items-center`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${theme.iconBg} shadow-sm`}>
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                报告中心
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                查看和分析自动化测试运行历史记录
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2 h-9 px-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 hover:shadow-md"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            刷新数据
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="px-4 sm:px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-700/50">
        <div className="flex flex-wrap items-end gap-3">
          {/* 筛选图标+标签 */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 self-center shrink-0">
            <Filter className="h-3.5 w-3.5" />
            <span>筛选</span>
          </div>

          {/* 触发方式 */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">触发方式</label>
            <select
              value={filters.triggerType || ''}
              onChange={(e) => handleFilterChange('triggerType', e.target.value)}
              className="h-8 pl-2.5 pr-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none cursor-pointer min-w-[100px]"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="">全部</option>
              <option value="manual">手动</option>
              <option value="jenkins">Jenkins</option>
              <option value="schedule">定时</option>
              <option value="ci_triggered">CI</option>
            </select>
          </div>

          {/* 状态 */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">状态</label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="h-8 pl-2.5 pr-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none cursor-pointer min-w-[100px]"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="">全部</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="running">运行中</option>
              <option value="pending">等待中</option>
              <option value="aborted">已中止</option>
            </select>
          </div>

          {/* 时间范围 */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">开始时间范围</label>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="h-8 pl-7 pr-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-[130px]"
                />
              </div>
              <span className="text-xs text-slate-400 shrink-0">至</span>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="h-8 pl-7 pr-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-[130px]"
                />
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={handleDateApply}
                disabled={!startDateInput && !endDateInput}
                className="h-8 px-3 text-xs"
              >
                应用
              </Button>
              {(filters.startDate || filters.endDate) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDateClear}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* 清空所有筛选 */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-700 self-end"
            >
              <X className="h-3 w-3" />
              清空筛选
            </Button>
          )}
        </div>

        {/* 已激活的筛选标签（方便用户一眼看到当前生效的筛选） */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-400">已筛选：</span>
            {filters.triggerType && (
              <ActiveFilterTag
                label={`触发方式: ${TRIGGER_TYPE_LABELS[filters.triggerType] || filters.triggerType}`}
                onRemove={() => handleFilterChange('triggerType', '')}
              />
            )}
            {filters.status && (
              <ActiveFilterTag
                label={`状态: ${STATUS_LABELS[filters.status] || filters.status}`}
                onRemove={() => handleFilterChange('status', '')}
              />
            )}
            {(filters.startDate || filters.endDate) && (
              <ActiveFilterTag
                label={`时间: ${filters.startDate || '…'} 至 ${filters.endDate || '…'}`}
                onRemove={handleDateClear}
              />
            )}
          </div>
        )}
      </div>

      {/* 列表内容区 */}
      <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900 rounded-b-xl shadow-sm border border-t-0 border-slate-200/80 dark:border-slate-700/50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <span className="text-sm text-slate-500 dark:text-slate-400">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-red-600 text-sm">加载失败: {(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>重试</Button>
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500 dark:text-slate-400">
            <History className="h-10 w-10 opacity-20" />
            <p className="font-medium">{hasActiveFilters ? '没有符合筛选条件的记录' : '暂无运行记录'}</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={handleClearAll}>清空筛选条件</Button>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* 桌面端表格 */}
            <div className="hidden lg:block flex-1 overflow-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">执行编号</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">触发信息</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">用例统计</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">开始时间</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">耗时</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data?.data.map((record) => (
                    <tr key={record.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-150">
                      <td className="px-4 py-3.5 text-sm font-mono text-slate-700 dark:text-slate-300">{record.id}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <TriggerTypeBadge type={record.trigger_type} />
                          <span>by {record.trigger_by_name || '系统'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={record.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs mb-1">
                          <span className="text-green-600 font-medium">{record.passed_cases} 通过</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-red-500 font-medium">{record.failed_cases} 失败</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-400">{record.total_cases} 总计</span>
                        </div>
                        <div className="w-24 bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                          <div 
                            className="bg-green-500 h-full transition-all duration-500" 
                            style={{ width: `${(record.passed_cases / (record.total_cases || 1)) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {record.start_time ? new Date(record.start_time).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                        {record.duration_ms ? `${(record.duration_ms / 1000).toFixed(1)}s` : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          {record.jenkins_url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="查看 Jenkins">
                              <a href={record.jenkins_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4 text-slate-400" />
                              </a>
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
                            <Link href={`/reports/${record.id}`}>
                              <FileText className="h-3.5 w-3.5" />
                              详情
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片列表 */}
            <div className="lg:hidden flex-1 overflow-auto">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.data.map((record) => (
                  <div key={record.id} className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-mono text-slate-400">{record.id}</span>
                          <StatusBadge status={record.status} />
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <TriggerTypeBadge type={record.trigger_type} />
                          <span className="text-[10px] text-slate-400">by {record.trigger_by_name || '系统'}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                        <Link href={`/reports/${record.id}`}>
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span>通过: {record.passed_cases}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span>失败: {record.failed_cases}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        <span>{record.start_time ? new Date(record.start_time).toLocaleDateString() : '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span>{record.duration_ms ? `${(record.duration_ms / 1000).toFixed(1)}s` : '-'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 分页 */}
            <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-4 order-2 sm:order-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">每页</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-8 w-16 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                  </select>
                </div>
                <div className="text-xs text-slate-500">
                  第 <span className="font-medium text-slate-700 dark:text-slate-300">{startIndex}</span>-
                  <span className="font-medium text-slate-700 dark:text-slate-300">{endIndex}</span> 条，
                  共 <span className="font-medium text-slate-700 dark:text-slate-300">{data?.total || 0}</span> 条
                </div>
              </div>

              <div className="flex items-center gap-1.5 order-1 sm:order-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-xs font-medium px-2">第 {page} / {totalPages || 1} 页</div>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 常量映射（用于筛选标签显示） ────────────────────────────────────────────

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  manual: '手动',
  jenkins: 'Jenkins',
  schedule: '定时',
  ci_triggered: 'CI',
};

const STATUS_LABELS: Record<string, string> = {
  success: '成功',
  failed: '失败',
  running: '运行中',
  pending: '等待中',
  aborted: '已中止',
  cancelled: '已取消',
};

// ─── 子组件 ───────────────────────────────────────────────────────────────────

function ActiveFilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
      {label}
      <button onClick={onRemove} className="hover:text-blue-800 dark:hover:text-blue-200 transition-colors">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function TriggerTypeBadge({ type }: { type: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    manual: { label: '手动', className: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' },
    jenkins: { label: 'Jenkins', className: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800' },
    schedule: { label: '定时', className: 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800' },
    ci_triggered: { label: 'CI', className: 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
  };
  const config = configs[type] || { label: type, className: 'bg-slate-50 text-slate-500 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string, variant: "success" | "destructive" | "secondary" | "outline" | "warning", icon: any }> = {
    success: { label: '成功', variant: 'success', icon: CheckCircle2 },
    failed: { label: '失败', variant: 'destructive', icon: XCircle },
    running: { label: '运行中', variant: 'secondary', icon: Loader2 },
    pending: { label: '等待中', variant: 'outline', icon: Clock },
    aborted: { label: '已中止', variant: 'warning', icon: AlertCircle },
    cancelled: { label: '已取消', variant: 'warning', icon: AlertCircle },
  };

  const config = configs[status] || { label: status, variant: 'outline', icon: AlertCircle };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1.5 px-2 py-0.5 font-medium">
      <Icon className={cn("h-3 w-3", status === 'running' && "animate-spin")} />
      {config.label}
    </Badge>
  );
}
